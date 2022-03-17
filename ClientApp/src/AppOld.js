
class AppOld extends Component {
    static displayName = App.name;

    constructor(props) {
        super(props);

        this.mouseEnter = this.mouseEnter.bind(this);
        this.state = {};
    }

    mouseEnter(idx) {
        this.setState({ hover: idx });
    }

    async componentDidMount() {
        const [response, response2] = await Promise.all([fetch("/api/graph"), fetch("/api/graph/followers")]);
        this.data = await response.json();
        this.followerData = await response2.json();

        const nodeCount = Math.sqrt(this.data.length);
        const zenithIndex = this.followerData.findIndex(t => t?.screenName === 'timburrs');

        console.log(zenithIndex, this.data.slice(zenithIndex * nodeCount, zenithIndex * nodeCount + nodeCount));
        console.log(this.data[zenithIndex * nodeCount + zenithIndex]);

        var points = [];
        for (let i = 0; i < nodeCount; i++) {
            points.push(Math.random() * screenSize); // Position x
            points.push(Math.random() * screenSize); // Position y
            points.push(0); // Velocity x
            points.push(0); // Velocity y
        }

        points[zenithIndex * 4] = 0;
        points[zenithIndex * 4 + 1] = 0;

        this.gpu = new window.GPU();
        this.positionKernel = this.gpu.createKernel(function (pts, a) {
            const pt = [
                pts[this.thread.x * 4], pts[this.thread.x * 4 + 1], // position
                pts[this.thread.x * 4 + 2], pts[this.thread.x * 4 + 3] // velocity
            ];
            const force = [0, 0];

            for (let i = 0; i < this.constants.size; i++) {
                if (i === this.thread.x) {
                    continue;
                }

                var otherPt = [pts[i * 4], pts[i * 4 + 1]];
                var diffX = pt[0] - otherPt[0];
                var diffY = pt[1] - otherPt[1];
                var distance = Math.sqrt(diffX * diffX + diffY * diffY);
                var mutuals = a[this.thread.x * this.constants.size + i];
                const desiredDistance = Math.max(4, 30 - mutuals) * this.constants.radius;

                if (mutuals == 0) continue;

                if (distance < this.constants.radius) {
                    // pt[0] += diffX / distance;
                    // pt[1] += diffY / distance;
                    // force[0] += diffX / distance * 100;
                    // force[1] += diffY / distance * 100;
                    // continue;
                }

                if (desiredDistance > 600) {
                    //     continue;
                }

                // force[0] -= diffX / distance * mutuals;
                // force[1] -= diffY / distance * mutuals;

                if (distance > desiredDistance) {
                    force[0] -= diffX / distance * mutuals;
                    force[1] -= diffY / distance * mutuals;
                } else {
                    force[0] += diffX / distance * mutuals;
                    force[1] += diffY / distance * mutuals;
                }

                /*

                if (distance < this.constants.radius) {
                    // pt[0] += diffX;
                    // pt[1] += diffY;
                    force[0] += diffX;
                    force[1] += diffY;
                    continue;
                }

                

                if (distance < 40) {
                    // force[0] += diffX / distance / 4;
                    // force[1] += diffY / distance / 4;
                }
                else if (mutuals > 0) {
                    force[0] -= diffX / Math.pow(distance, 3) * mutuals;
                    force[1] -= diffY / Math.pow(distance, 3) * mutuals;
                }
                */
            }

            const dist = Math.sqrt(force[0] * force[0] + force[1] * force[1]);
            if (dist > 0.1) {
                force[0] = force[0];
                force[1] = force[1];
                pt[2] += force[0];
                pt[3] += force[1];
            }
            // pt[2] += Math.min(Math.max(force[0], -1), 1);
            // pt[3] += Math.min(Math.max(force[1], -1), 1);

            pt[2] = Math.min(Math.max(pt[2], -1), 1);
            pt[3] = Math.min(Math.max(pt[3], -1), 1);

            pt[2] *= 0.95;
            pt[3] *= 0.95;

            pt[0] += pt[2];
            pt[1] += pt[3];

            if (pt[0] < this.constants.radius) { pt[0] = this.constants.radius; }
            if (pt[1] < this.constants.radius) { pt[1] = this.constants.radius; }
            if (pt[0] > this.constants.screenSize) { pt[0] = this.constants.screenSize; }
            if (pt[1] > this.constants.screenSize) { pt[1] = this.constants.screenSize; }

            return pt;
        }, {
            constants: {
                size: nodeCount,
                radius: nodeRadius * 2,
                screenSize: screenSize,
            },
            output: [nodeCount],
        });

        this.kernelOutput = this.positionKernel(points, this.data);
        this.nodeCount = nodeCount;
        this.forceUpdate();
        this.anim = requestAnimationFrame(() => this.runKernel());
    }

    componentWillUnmount() {
        cancelAnimationFrame(this.anim);
    }

    runKernel() {
        this.kernelOutput = this.positionKernel(this.kernelOutput, this.data);
        this.forceUpdate();
        this.anim = requestAnimationFrame(() => this.runKernel());
    }

    render() {
        if (!this.kernelOutput) {
            return <div />;
        }

        return <svg viewBox={`0 0 ${screenSize} ${screenSize}`} xmlns="http://www.w3.org/2000/svg" style={{ width: `${screenSize}px` }}>
            <defs>
                {
                    this.followerData.map((item, idx) => {
                        if (item == null) {
                            return undefined;
                        }

                        return <pattern key={idx} id={`profileImage${idx}`} x="0%" y="0%" height="100%" width="100%"
                            viewBox="0 0 48 48">
                            <image x="0%" y="0%" width="48" height="48" xlinkHref={item.profileImageUrl}></image>
                        </pattern>;
                    })
                }
            </defs>
            {
                this.state.hover && this.kernelOutput.map((pt2, idx) => {
                    const pt1 = this.kernelOutput[this.state.hover];
                    const mutuals = this.data[this.state.hover * this.nodeCount + idx];

                    if (mutuals == 0) {
                        return undefined;
                    }

                    return <line
                        key={idx}
                        x1={pt1['0']}
                        y1={pt1['1']}
                        x2={pt2['0']}
                        y2={pt2['1']}
                        stroke="black"
                        strokeWidth={Math.min(mutuals / 4, 30)}
                    />;
                })
            }
            {
                this.kernelOutput.map((item, idx) => {
                    const user = this.followerData[idx];

                    return <UserNode
                        screenName={user?.screenName}
                        x={item['0']} y={item['1']}
                        idx={idx}
                        key={idx}
                        nodeRadius={nodeRadius}
                        mouseEnter={this.mouseEnter}
                    />;
                })
            }
        </svg>;

        /*
        return (
            <Layout>
                <Route exact path='/' component={Home} />
                <Route path='/counter' component={Counter} />
                <Route path='/fetch-data' component={FetchData} />
            </Layout>
        );
        */
    }
}