import * as React from "react";
import { WheelEventHandler } from "react";
import * as ReactDOM from "react-dom";

interface Point {
    x: number;
    y: number;
}

export interface Transform extends Point {
    scale: number;
}


interface MovableCanvasProps {
    //transform: Transform;
    //update(t: Transform): void;
    // translate(x: number, y: number): void;
    // zoom(delta: number, x: number, y: number): void;
    // sizeReceived(widht: number, height: number): void;
    width: number;
    height: number;
}

interface MovableCanvasState {
    size: {
        width: number;
        height: number;
    };
    panning: {
        isDragging: boolean;
        lastclientX: number;
        lastclientY: number;
    };
    transform: Transform;
}

export class MovableCanvas extends React.Component<MovableCanvasProps, MovableCanvasState>  {
    public resizeObserver: ResizeObserver | undefined;

    constructor(props: MovableCanvasProps) {
        super(props);

        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.startPanning = this.startPanning.bind(this);

        this.state = {
            transform: { x: props.width / 2, y: props.height / 2, scale: 1.0 },
            size: { width: 0, height: 0 },
            panning: {
                isDragging: false,
                lastclientX: 0,
                lastclientY: 0
            }
        };
    }

    componentDidMount() {
        var node = ReactDOM.findDOMNode(this) as HTMLElement;
        this.resizeObserver = new ResizeObserver(() => {
            const rect = node.getBoundingClientRect();
            this.setState({ size: { width: rect.width, height: rect.height } });
        });
        this.resizeObserver.observe(node);
    }

    componentWillUnmount() {
        this.resizeObserver?.disconnect();
    }

    getOffset() {
        var node: any = ReactDOM.findDOMNode(this);
        var offset = { top: 0, left: 0 };

        while (node) {
            offset.top -= node.offsetTop;
            offset.left -= node.offsetLeft;
            node = node.offsetParent;
        }

        return offset;
    }

    onMouseMove(event: React.MouseEvent) {
        //event.buttons checks if the mouse buttons is still pressed
        if (this.state.panning && this.state.panning.isDragging && event.buttons > 0) {
            var x = this.state.panning.lastclientX - event.clientX;
            var y = this.state.panning.lastclientY - event.clientY;

            this.setState({
                transform: {
                    ...this.state.transform,
                    x: x + this.state.transform.x,
                    y: y + this.state.transform.y,
                },
                panning: {
                    ...this.state.panning,
                    lastclientX: event.clientX,
                    lastclientY: event.clientY
                }
            });

            return;
        }
    }

    onWheel(event: React.WheelEvent) {
        const size = this.state.size;
        const offset = this.getOffset();
        const x = event.clientX + offset.left - size.width / 2;
        const y = event.clientY + offset.top - size.height / 2;
        const d = event.deltaY < 0 ? 0.1 : -0.1;
        const transform = this.state.transform;
        const scale = transform.scale + d;

        if (scale <= 0.01) {
            return;
        }

        this.setState({
            transform: {
                scale,
                x: transform.x + ((transform.x + x) / transform.scale) * d,
                y: transform.y + ((transform.y + y) / transform.scale) * d,
            }
        });
    }

    onMouseUp() {
        if (this.state.panning.isDragging) {
            this.setState({
                panning: {
                    ...this.state.panning,
                    isDragging: false
                }
            });
        }
    }


    startPanning(event: React.MouseEvent<HTMLDivElement>) {
        const target = event.target as HTMLDivElement;
        if (target.tagName === "svg") {
            this.setState({
                panning: {
                    ...this.state.panning,
                    isDragging: true,
                    lastclientX: event.clientX,
                    lastclientY: event.clientY
                }
            });
        }
    }

    public render() {
        const transform = this.state.transform;
        const size = this.state.size;
        const x = transform.x - size.width / 2;
        const y = transform.y - size.height / 2;

        const style: React.CSSProperties = {
            transform: `translate(${-x}px, ${-y}px) scale(${transform.scale})`,
            transformOrigin: "0% 0%",
            width: this.props.width + "px",
            height: this.props.height + "px",
            overflow: "hidden",
            position: 'relative',
        };

        return <div style={{ position: 'absolute', top: '0px', bottom: '0px', right: '0px', left: '0px', overflow: 'hidden' }}>
            <div style={style} onMouseMove={this.onMouseMove} onMouseUp={this.onMouseUp} onMouseDown={this.startPanning} onWheel={this.onWheel}  >
                {this.props.children}
            </div>
        </div>;
    }
}
