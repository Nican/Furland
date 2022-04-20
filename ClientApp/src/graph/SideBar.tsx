import Graph from "graphology";
import { Component } from "react";
import { TwitterData, TwitterUserData } from "./Data";

interface UserNodeDetailsProps {
  graph: Graph;
  selected: number;
  followerData: TwitterUserData[];
  slice: number[];
  data: TwitterData;
  mutualOnly: boolean;
  mouseEnter(name: number | null): void;
}

interface Entry {
  value: number;
  idx: number;
}

export class UserNodeDetails extends Component<UserNodeDetailsProps> {

  render() {
    const { selected, followerData, mutualOnly, data, graph, mouseEnter } = this.props;

    const user = followerData[selected];
    const sliceMap = this.props.slice
      .map((value: any, idx: any) => { return { value, idx }; })
      .filter(t => {
        if (t.value === 0 || t.idx === selected) {
          return false;
        }

        if (mutualOnly && !data.isMutual(selected, t.idx)) {
          return false;
        }

        return true;
      })
      .sort((a: Entry, b: Entry) => {
        const aEdge = graph.hasEdge(selected, a.idx);
        const bEdge = graph.hasEdge(selected, b.idx);

        if (aEdge && !bEdge) {
          return -1;
        } else if (bEdge && !aEdge) {
          return 1;
        }

        return b.value - a.value;
      });

    const selectedData = this.props.followerData[selected];

    return <div>
      <div style={{ textAlign: 'center' }}>
        <h5>
          <a href={`https://twitter.com/${selectedData.screenName}`} target='_blank' >
            {user?.screenName}
            <img src={`/api/twitter/${user.id}/picture`} style={{ float: 'left', height: '32px' }} />
          </a>
        </h5>
        <br style={{ clear: 'both' }} />
      </div>
      {
        sliceMap.slice(0, 200).map((entry: Entry) => {
          const t = this.props.followerData[entry.idx];
          if (!t) {
            return undefined;
          }
          const hasEdge = graph.hasEdge(selected, entry.idx);
          return <div onMouseEnter={() => mouseEnter(entry.idx)} onMouseLeave={() => mouseEnter(null)} >
            {t.screenName}
            <span style={{ float: 'right', color: hasEdge ? 'white' : '#ccc', fontWeight: hasEdge ? 'bold' : 'normal' }}>
              {entry.value}
            </span>
            <a href={`https://twitter.com/${t.screenName}`} target='_blank' >
              <img src={`/api/twitter/${t.id}/picture`} style={{ float: 'left', height: '24px' }} loading="lazy" />
            </a>
            <br style={{ clear: 'both' }} />
          </div>
        })
      }
    </div>;
  }
}