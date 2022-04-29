import Graph from "graphology";
import { EdgeConfig } from "./Config";
import { TwitterData } from "./Data";
import Heap from 'heap';

class EdgeWeightBaseClass {
  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {
  }
  public getEdgeWeight(x: number, y: number): number {
    return 1;
  }
}

class LinearWeightClass {
  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {
  }
  public getEdgeWeight(x: number, y: number): number {
    const { data } = this;
    const mutuals = data.friendCount(x, y);
    return Math.min(mutuals / 100, 2);
  }
}

class RatioWeightClass {
  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {
  }
  public getEdgeWeight(x: number, y: number): number {
    const { data } = this;
    const userX = data.getFriend(x);
    const userY = data.getFriend(y);
    const mutuals = data.friendCount(x, y);
    return Math.pow(mutuals / Math.max(userX.friendsCount, userY.friendsCount), 1 / 4) * 2;
  }
}

class TotalRatioWeightClass {
  public maxValue: { [x: number]: number } = {};
  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {
    // This reduce has over 100,000 items. 
    // this.maxValue = data.data.mutualMatrix.reduce((a, b) => Math.max(a, b)) / 2;

    data.followerData.forEach((value, idx) => {
      const slice = data.friendSlice(idx);
      slice.splice(idx, 1); // Remove the identity 
      this.maxValue[idx] = slice.reduce((a, b) => Math.max(a, b));
    });
  }
  public getEdgeWeight(x: number, y: number): number {
    const { data } = this;
    const mutuals = data.friendCount(x, y);
    return (mutuals / Math.max(this.maxValue[x], this.maxValue[y])) * 4;
  }
}

export interface EdgeInterface {
  updateGraph(graph: Graph, data: TwitterData, edgeConfig: EdgeConfig): void;
}

export class BaseEdgeClass {
  protected edgeWeight: EdgeWeightBaseClass;

  constructor(public data: TwitterData, public edgeConfig: EdgeConfig) {
    if (edgeConfig.edgeWeights === 'linear') {
      this.edgeWeight = new LinearWeightClass(data, edgeConfig);
    } else if (edgeConfig.edgeWeights === 'ratio') {
      this.edgeWeight = new RatioWeightClass(data, edgeConfig);
    } else if (edgeConfig.edgeWeights === 'maxRatio') {
      this.edgeWeight = new TotalRatioWeightClass(data, edgeConfig);
    } else {
      this.edgeWeight = new EdgeWeightBaseClass(data, edgeConfig);
    }
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

        graph.mergeUndirectedEdge(x.toString(), y.toString(), {
          weight: this.edgeWeight.getEdgeWeight(x, y),
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
            weight: this.edgeWeight.getEdgeWeight(x, item.idx),
          });
          graph.mergeUndirectedEdge(item.idx.toString(), x.toString(), {
            weight: this.edgeWeight.getEdgeWeight(item.idx, x),
          });
        }
      });
    }
  }

}

export class HeapOrderedEdges extends BaseEdgeClass {
  updateGraph(graph: Graph) {
    const { edgeConfig, data } = this;

    const topN = edgeConfig.topN;
    const topN2 = topN * 2; // Edges need to be bi-directional. Count twice.
    const maxFriendRatio = edgeConfig.maxFriendRatio / 100;

    const items = data.followerData.map((value, index) => {
      const slice = data.friendSlice(index)
        .map((value, idx) => ({ value, idx }))
        .filter(t => {
          if (edgeConfig.mutualsOnly && !data.isMutual(t.idx, index)) {
            return false;
          }

          return t.value > 0 && t.idx !== index;
        })
        .sort((a, b) => b.value - a.value);

      return {
        value,
        index,
        slice,
        sliceId: 0,
      };
    });

    const heap = new Heap<typeof items[0]>((a, b) => b.slice[b.sliceId].value - a.slice[a.sliceId].value);

    for (const item of items) {
      if (item.slice.length > 0) {
        heap.push(item);
      }
    }

    while (!heap.empty()) {
      const item = heap.pop();

      if (!item) {
        break;
      }

      const x = item.index;
      if (graph.degree(x.toString()) >= topN2) {
        continue;
      }

      const sliceItem = item.slice[item.sliceId];
      const otherSlide = items[sliceItem.idx];
      const y = sliceItem.idx;
      item.sliceId++;

      const maxTopValue = Math.max(item.slice[0].value, otherSlide.slice[0].value); // item.slice[0].value
      if (sliceItem.value < (maxTopValue * maxFriendRatio)) {
        continue;
      }

      if (graph.degree(y.toString()) < topN2) {
        graph.mergeUndirectedEdge(x.toString(), y.toString(), {
          weight: this.edgeWeight.getEdgeWeight(x, y),
        });
        graph.mergeUndirectedEdge(y.toString(), x.toString(), {
          weight: this.edgeWeight.getEdgeWeight(y, x),
        });
      }

      if (item.sliceId >= edgeConfig.maxFriendRank) {
        continue;
      }

      if (graph.degree(x.toString()) < topN2 && item.sliceId < item.slice.length) {
        heap.push(item);
      }
    }
  }

}