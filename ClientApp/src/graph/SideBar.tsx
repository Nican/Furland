import { Component } from "react";
import { TwitterData, TwitterUserData } from "./Data";

interface UserNodeDetailsProps {
  selected: number;
  followerData: TwitterUserData[];
  slice: number[];
  data: TwitterData;
  mutualOnly: boolean;
}

export class UserNodeDetails extends Component<UserNodeDetailsProps> {
  render() {
    const { selected, followerData, mutualOnly, data } = this.props;

    const user = followerData[selected];
    const sliceMap = this.props.slice
      .map((value: any, idx: any) => { return [value, idx]; })
      .filter(t => {
        if (t[0] === 0) { // && t[1] === selected
          return false;
        }

        if (mutualOnly && !data.isMutual(selected, t[1])) {
          return false;
        }

        return true;
      })
      .sort((a: any, b: any) => b[0] - a[0]);

    return <div>
      <div style={{ textAlign: 'center' }}>
        <h5>
          {user?.screenName}
          <img src={`/api/twitter/${user.id}/picture`} style={{ float: 'left', height: '32px' }} />
        </h5>
      </div>
      {
        sliceMap.slice(0, 100).map((idx: any) => {
          const t = this.props.followerData[idx[1]];
          if (!t) {
            return undefined;
          }
          return <div>
            {t.screenName}
            <span style={{ float: 'right' }}>
              {idx[0]}
            </span>
            <a href={`https://twitter.com/${t.screenName}`} target='_blank' >
              <img src={`/api/twitter/${t.id}/picture`} style={{ float: 'left', height: '24px' }} loading="lazy" />
            </a>
          </div>
        })
      }
    </div>;
  }
}