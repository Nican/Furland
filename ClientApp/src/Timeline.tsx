import { Timeline, Tweet } from 'react-twitter-widgets'


export const NicanTimeline: React.FC = () => {

  return <div>
    <div>
      <p>This is a pet project, running on a home server. Please be gentle and patient.</p>
      <p>Furland displays all of your friends (nodes) in a graph, and adds edges based on how many followers (connections) each two persons have in common. Edges with higher value take priority to be added into the graph until each node has "TopN" connections. </p>
      <p>TL;DR: Proximity = same followers.</p>
      <p>
        Hope you enjoy the project. If you want to leave a tip:
        <ul>
          <li>Kofi: <a href="https://ko-fi.com/nicanbun">https://ko-fi.com/nicanbun</a></li>
          <li>BTC: 31kZwX4ym4YnKtDQsgzs1R9mnicywjpRhB</li>
          <li>ETH: 0x0f39E8f8B156e10309838d996628c97abe43dCbe</li>
        </ul>
        I will give some of the proceedings to the library maintainers as well.
      </p>
      <p>
        <a href="https://github.com/Nican/Furland">Source code</a>
      </p>
    </div>
    <Timeline
      dataSource={{
        sourceType: 'profile',
        screenName: 'Nican'
      }}
      options={{
        width: '400',
        height: '600',
        theme: 'dark',
      }}
    />
  </div>;
}

