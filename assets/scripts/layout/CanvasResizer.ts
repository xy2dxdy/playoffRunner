import { _decorator, Component, ResolutionPolicy, view, Size } from 'cc';
import { GameOrientation } from './GameOrientation';
import { DynamicUI } from './DynamicUI';
const { ccclass, executionOrder } = _decorator;

/** Раньше RunnerWorldScroller: сначала SHOW_ALL и размер Canvas, потом initBackground. */
@executionOrder(-100)
@ccclass('CanvasResizer')
export class CanvasResizer extends Component {
    private designWidth: number = 0;
    private designHeight: number = 0;


    protected override start() {
        const dr = view.getDesignResolutionSize();
        this.designWidth = dr.width;
        this.designHeight = dr.height;

        this.onResize();
        view.on('canvas-resize', this.onResize, this);
    }

    protected override onDestroy() {
        view.off('canvas-resize', this.onResize, this);
    }

    public onResize() {
        const sr = view.getFrameSize();

        const scale = Math.max(
            this.designWidth / (sr.width),
            this.designHeight / (sr.height)
        );
        const vWidth = (sr.width) * scale;
        const vHeight = (sr.height) * scale;
        view.setDesignResolutionSize(vWidth, vHeight, ResolutionPolicy.SHOW_ALL);
        var newSize = new Size(vWidth, vHeight);
        GameOrientation.setResize(newSize);
        var dynamicsUI = this.getComponentsInChildren(DynamicUI)
    
        dynamicsUI.forEach(async (ui) => {

            ui.onResize(newSize);


        })
    }
}


