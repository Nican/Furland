
export interface TwitterUserData {
    id: string;
    screenName: string;
    friendsCount: number;
    friends: Set<string>;
}

export interface InputData {
    mutualMatrix: number[];
    friends: TwitterUserData[];
}


export class TwitterData {
    public readonly nodeCount: number;

    get followerData() {
        return this.data.friends;
    }

    constructor(private data: InputData) {

        this.nodeCount = Math.sqrt(this.data.mutualMatrix.length);

        for (const friend of data.friends) {
            friend.friends = new Set(friend.friends);
        }

        console.log(data);
    }

    public getFriend(id: number): TwitterUserData {
        return this.data.friends[id];
    }

    public friendCount(id1: number, id2: number): number {
        return this.data.mutualMatrix[id1 * this.nodeCount + id2];
    }

    public friendSlice(x: number) {
        const nodeCount = this.nodeCount;
        return this.data.mutualMatrix.slice(x * nodeCount, x * nodeCount + nodeCount);
    }

    public isMutual(id1: number, id2: number): boolean {
        const p1 = this.data.friends[id1];
        const p2 = this.data.friends[id2];

        return p1.friends.has(p2.id) && p2.friends.has(p1.id);
    }


}