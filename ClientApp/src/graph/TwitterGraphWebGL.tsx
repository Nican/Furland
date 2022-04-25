import React, { Component, MutableRefObject, useEffect, useState } from 'react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import { MovableCanvas } from '../MovableCanvas';

import { InputData, TwitterData, TwitterUserData } from './Data';
import { Config } from './Config';
import { UserNodeDetails } from './SideBar';
import { button, buttonGroup, useControls } from 'leva';
import { BasicEdges, HeapOrderedEdges, TopNEdges } from './Edge';
import { saveAsPng } from './Png';
import louvain from 'graphology-communities-louvain';
import Sigma from 'sigma';
import getNodeImageProgram from "./sigmaImage";

let screenSize = 12000;
let nodeRadius = 2;

interface TwitterGraphProps {
  screenName: string;
  inputData: InputData;
}

interface TwitterGraphState {

}

interface StatsDetail {
  nodes: number;
  edges: number;
}

export const TwitterGraphWithConfig: React.FC<TwitterGraphProps> = props => {

  const resetRef = React.useRef<() => void>();
  const saveAsPngRef = React.useRef<() => void>();
  const [stats, setStats] = useState<StatsDetail>({ nodes: 0, edges: 0 });
  const [params] = useState(() => new URLSearchParams(window.location.search));

  /*
    preset: {
      value: 1,
      render: () => false,
    },
    presetsBtn: {
      ...buttonGroup({
        label: 'Presets',
        opts: {
          '1': () => set({ 'preset': 1 }),
          '2': () => set({ 'preset': 2 }),
          '3': () => set({ 'preset': 3 }),
        },
      }),
      render: () => false,
    },
  */

  const [{ slowDown, mutualsOnly, topN, maxFriendRank, images, maxFriendRatio, resolution, stroke }, set] = useControls('Graph', (): any => ({
    totalNodes: {
      value: ``,
      editable: false,
    },
    speedBtn: buttonGroup({
      label: 'Speed',
      opts: {
        '0x': () => set({ 'slowDown': -1 }),
        '1x': () => set({ 'slowDown': 100 }),
        '2x': () => set({ 'slowDown': 50 }),
        '4x': () => set({ 'slowDown': 20 }),
        '8x': () => set({ 'slowDown': 5 }),
      },
      render: () => true,
    }),
    slowDown: {
      value: 50,
      min: 0,
      max: 100,
      render: () => false,
    },
    images: true,
    stroke: {
      value: true,
      render: (get: any) => get('Graph.images') === true,
    },
    resolution: {
      value: 10,
      min: 1,
      max: 20,
      render: (get: any) => get('Graph.images') === false || get('Graph.stroke') === true,
    },
    mutualsOnly: params.get('mutualsOnly') === 'true',
    topN: {
      value: parseInt(params.get('topN') || '50', 10) || 50,
      min: 1,
      max: 100,
    },
    maxFriendRank: {
      value: parseInt(params.get('maxFriendRank') || '20', 10) || 20,
      min: 1,
      max: 100,
    },
    maxFriendRatio: {
      value: parseInt(params.get('maxFriendRatio') || '0', 10) || 0,
      min: 0,
      max: 99,
    },
    reset: button(() => {
      if (resetRef.current) {
        resetRef.current();
      }
    }),
    save: {
      label: 'Save as PNG',
      ...button(() => {
        if (saveAsPngRef.current) {
          saveAsPngRef.current();
        }
      })
    },
  }));

  useEffect(() => {
    set({ totalNodes: `Nodes: ${stats.nodes}\nEdges: ${stats.edges}` });
  }, [stats.nodes, stats.edges]);

  useEffect(() => {
    const newParams = new URLSearchParams(window.location.search);
    newParams.set('topN', topN);
    newParams.set('maxFriendRank', maxFriendRank);
    newParams.set('mutualsOnly', mutualsOnly);
    newParams.set('maxFriendRatio', maxFriendRatio);

    window.history.pushState(undefined, '', window.location.pathname + '?' + newParams.toString());
  }, [topN, maxFriendRank, mutualsOnly, maxFriendRatio]);

  const config: Config = {
    graph: {
      adjustSizes: true,
      barnesHutOptimize: false,
      strongGravityMode: true,
      gravity: 0.1,
      edgeWeightInfluence: 1,
      scalingRatio: 10,
      weighted: false,
      slowDown,
      linLogMode: false,
      images,
      stroke,
    },
    edge: {
      edgeAlgorithm: 'HeapOrder',
      edgeWeights: 'none',
      mutualsOnly,
      maxFriendRank,
      topN,
      maxFriendRatio,
      resolution,
    },
  };

  return <TwitterGraph {...props} config={config} reset={resetRef} saveAsPng={saveAsPngRef} setStats={setStats} />
};

interface TwitterGraphPropsInner {
  reset: MutableRefObject<(() => void) | undefined>;
  saveAsPng: MutableRefObject<(() => void) | undefined>;
  config: Config;
  screenName: string;
  inputData: InputData;
  setStats(stats: StatsDetail): void;
}

export class TwitterGraph extends Component<TwitterGraphPropsInner, TwitterGraphState> {
  private layout?: FA2Layout;
  private graph: Graph;
  private data: TwitterData;
  private container: React.RefObject<HTMLDivElement>;
  private renderer: Sigma | undefined;

  constructor(props: any) {
    super(props);

    this.state = {
    };

    this.data = new TwitterData(props.inputData);
    this.graph = new Graph();
    this.container = React.createRef();

    props.reset.current = this.reset.bind(this);
    props.saveAsPng.current = this.saveAsPng.bind(this);

    this.data.followerData.forEach((item, idx) => {
      const maxSize = Math.max(item.followersCount, item.followersCount);
      let size = Math.sqrt(Math.min(maxSize, 10000)) / Math.sqrt(10000) * nodeRadius * 2 + nodeRadius;
      let x = (Math.random() - 0.5) * screenSize;
      let y = (Math.random() - 0.5) * screenSize;

      if (item.screenName === this.props.screenName) {
        size = nodeRadius * 4;
      }

      console.log(item, size);

      this.graph.addNode(idx, {
        id: idx,
        size,
        x,
        y,
        fixed: false,
        type: 'image',
        image: `/api/twitter/${item.id}/picture`,
      });
    });
    this.setupEdges();
    this.reset();

  }

  public override componentDidMount() {

    this.clearupNodes();
    this.renderer = new Sigma(this.graph, this.container.current!, {
      // We don't have to declare edgeProgramClasses here, because we only use the default ones ("line" and "arrow")
      nodeProgramClasses: {
        image: getNodeImageProgram(),
        // border: NodeProgramBorder,
      },
      // renderEdgeLabels: true,
    });

  }

  public override componentWillUnmount() {
    this.renderer?.kill();
    this.layout?.kill();
  }

  public override componentDidUpdate(prevProps: TwitterGraphPropsInner) {
    if (JSON.stringify(prevProps.config.graph) !== JSON.stringify(this.props.config.graph)) {
      this.setupForceAtlas();
    }

    if (JSON.stringify(prevProps.config.edge) !== JSON.stringify(this.props.config.edge)) {
      this.setupEdges();
    }
  }

  saveAsPng() {
    saveAsPng(this.graph, this.props.screenName, this.props.config.graph.stroke);
  }

  reset() {
    this.graph.updateEachNodeAttributes(
      function (node, attr) {
        attr.x = (Math.random() - 0.5) * screenSize;
        attr.y = (Math.random() - 0.5) * screenSize;
        return attr;
      },
      { attributes: ['x', 'y'] }
    );

    this.setupForceAtlas();
  }

  setupEdges() {
    const { graph } = this;
    this.layout?.kill();
    graph.clearEdges();
    const edgeConfig = this.props.config.edge;

    if (edgeConfig.edgeAlgorithm === 'Basic') {
      var calculator = new BasicEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }
    else if (edgeConfig.edgeAlgorithm === 'TopN') {
      var calculator = new TopNEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }
    else if (edgeConfig.edgeAlgorithm === 'HeapOrder') {
      var calculator = new HeapOrderedEdges(this.data, edgeConfig);
      calculator.updateGraph(graph);
    }

    // const communities = louvain(graph);
    // console.log('communities', communities);
    louvain.assign(graph, {
      resolution: edgeConfig.resolution / 10,
    });

    this.clearupNodes();
    this.setupForceAtlas();
  }

  clearupNodes() {
    const { graph, props: { config } } = this;
    const graphConfig = config.graph;
    let nodes = 0;
    let maxCommunity = 1;

    this.graph.forEachNode((_idx, attr) => {
      if (!attr.fixed) {
        maxCommunity = Math.max(maxCommunity, attr.community);
      }
    });

    // Hide all nodes with 0 edges
    graph.updateEachNodeAttributes(
      function (node, attr) {
        const empty = graph.degree(node) === 0;
        const color = `hsl(${attr.community / maxCommunity * 360}, 100%, 50%)`;

        if (attr.fixed !== empty) {
          attr.fixed = empty;
          attr.x = (Math.random() - 0.5) * screenSize;
          attr.y = (Math.random() - 0.5) * screenSize;
        }
        attr.color = color;

        if (!empty) {
          nodes++;
        }
        return attr;
      },
      { attributes: ['fixed', 'x', 'y', 'color'] }
    );

    this.props.setStats({
      edges: graph.size,
      nodes,
    })
  }

  setupForceAtlas() {
    if (this.layout) {
      this.layout.kill();
      this.layout = undefined;
    }

    const graphConfig = this.props.config.graph;

    if (graphConfig.slowDown > 0) {
      this.layout = new FA2Layout(this.graph, {
        settings: {
          gravity: graphConfig.gravity,
          edgeWeightInfluence: graphConfig.edgeWeightInfluence,
          weight: 'weight',
          weighted: graphConfig.weighted,
          barnesHutOptimize: graphConfig.barnesHutOptimize,
          strongGravityMode: graphConfig.strongGravityMode,
          scalingRatio: graphConfig.scalingRatio,
          slowDown: graphConfig.slowDown,
          linLogMode: graphConfig.linLogMode,
        } as any,
        weighted: graphConfig.weighted,
      });

      // To start the layout
      this.layout.start();
    }

    this.clearupNodes();
  }

  render() {
    const cx = screenSize / 2;
    const cy = screenSize / 2;

    const data = this.data;
    const followerData = data.followerData;

    // <button onClick={this.saveAsPng}>Save as PNG</button>
    /* 
    <div style={{ position: 'absolute', left: '0px', width: '200px', top: '0px', bottom: '0px', overflow: 'auto' }}>
            {this.state.selectedNode && (<UserNodeDetails
          graph={this.graph}
          selected={this.state.selectedNode}
          followerData={followerData}
          slice={data.friendSlice(this.state.selectedNode)}
          data={data}
          mutualOnly={this.props.config.edge.mutualsOnly}
          mouseEnter={this.mouseEnter}
        />)}
        </div>
    */
    return <>
      <div style={{ position: 'absolute', left: '0px', right: '0px', top: '0px', bottom: '0px', overflow: 'hidden' }} >
        <div style={{ width: '100%', height: '100%', margin: 0, padding: 0, overflow: 'hidden' }} ref={this.container}>

        </div>
      </div>
    </>;

  }
}
