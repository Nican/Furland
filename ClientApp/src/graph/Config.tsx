export interface Config {
  // data: DataConfig;
  graph: GraphConfig;
  edge: EdgeConfig;
}

export interface DataConfig {
  nodes: 'followers' | 'friends';
  relationship: 'followers' | 'friends';
}

export interface GraphConfig {
  adjustSizes: boolean;
  barnesHutOptimize: boolean;
  strongGravityMode: boolean;
  weighted: boolean;
  gravity: number;
  slowDown: number;
  scalingRatio: number;
  edgeWeightInfluence: number;
  linLogMode: boolean;
  images: boolean;
  stroke: boolean;
  // reset(): void;
}

export interface EdgeConfig {
  edgeAlgorithm: string;
  topN: number;
  mutualsOnly: boolean;
  edgeWeights: string;
  maxFriendRank: number;
  maxFriendRatio: number;
  resolution: number;
}
