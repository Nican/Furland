import Graph from "graphology";
import { EdgeConfig } from "./Config";
import { TwitterData } from "./Data";


export interface EdgeInterface {
  updateGraph(graph: Graph, data: TwitterData, edgeConfig: EdgeConfig): void;
}

export class BaseEdgeClass {

  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {

  }

  public getEdgeWeight(x: number, y: number) {
    const { data, edgeConfig } = this;

    if (edgeConfig.edgeWeights === 'linear') {
      const mutuals = data.friendCount(x, y);
      return Math.min(mutuals / 100, 2);
    }

    if (edgeConfig.edgeWeights === 'ratio') {
      const userX = data.getFriend(x);
      const userY = data.getFriend(y);
      const mutuals = data.friendCount(x, y);
      return Math.pow(mutuals / Math.max(userX.friendsCount, userY.friendsCount), 1/4) * 2;
    }

    return 1;
  }

}

export class BasicEdges extends BaseEdgeClass {
  updateGraph(graph: Graph) {
    const { edgeConfig, data } = this;
    const nodeCount = data.nodeCount;

    for (var x = 0; x < nodeCount; x++) {
      for (var y = 0; y < nodeCount; y++) {
        if (x === y) {
          continue;
        }

        const mutualCount = data.friendCount(x, y);

        if (mutualCount === 0) {
          continue;
        }

        if (edgeConfig.mutualsOnly && !data.isMutual(x, y)) {
          continue;
        }

        /*
        const edge_threshold = Math.min(3, mutualCount / 10)
 
        if (mutualCount <= edge_threshold) {
            // if (mutualCount == 0 || oppositeCount == 0) {
            continue;
        }
        */

        graph.mergeUndirectedEdge(x.toString(), y.toString(), {
          // weight: 1,
          weight: this.getEdgeWeight(x, y),
          // weight: Math.sqrt(mutualCount) / 10,
        });
      }
    }
  }
}

export class TopNEdges extends BaseEdgeClass {
  updateGraph(graph: Graph) {
    const { edgeConfig, data } = this;

    const topN = edgeConfig.topN;
    const followerData = data.followerData;

    const items = data.followerData
      .map((value, index) => ({ value, index, sliceCount: data.friendSlice(index).filter(t => t > 0).length }))
      .sort((a, b) => b.sliceCount - a.sliceCount);

    // for (let x = 0; x < nodeCount; x++) {
    for (const item of items) {
      const x = item.index;
      const slice = data.friendSlice(x);
      const map = slice
        .map((value, idx) => ({ value, idx }))
        .filter(t => {
          if (t.value <= 0) {
            return false;
          }

          if (edgeConfig.mutualsOnly && !data.isMutual(x, t.idx)) {
            return false;
          }

          if (graph.degree(t.idx) > topN) {
            return false;
          }

          return true;
        })
        .sort((a, b) => {
          const profileA = followerData[a.idx];
          const profileB = followerData[b.idx];

          //if (followB == followA) {
          // return (b[0] - a[0]) / profileB.friendsCount;
          //}

          //return followB - followA;
          return b.value - a.value;
        });

      map.forEach(item => {
        if (graph.degree(x.toString()) < topN) {
          graph.mergeUndirectedEdge(x.toString(), item.idx.toString(), {
            weight: this.getEdgeWeight(x, item.idx), 
          });
          graph.mergeUndirectedEdge(item.idx.toString(), x.toString(), {
            weight: this.getEdgeWeight(item.idx, x), 
          });
        }
      });
    }
  }

}