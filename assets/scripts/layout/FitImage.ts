import { _decorator, Component, Node, Size, UITransform, view, Widget } from 'cc';
import { CanvasResizer } from './CanvasResizer';
import { DynamicUI } from './DynamicUI';
import { property } from '../property';
const { ccclass } = _decorator;
@ccclass('FitImage')
export class FitImage extends DynamicUI {
    @property(Boolean)
    public _scale: boolean = false;

    @property(Number)
    public readonly _currentScale: number = 1;



    public override onResize(s: Size = new Size()) {
        if (this.node.scale.x === 0 || this.node.scale.y === 0) return;
        super.onResize(s);
        const transform = this.node.getComponent(UITransform);

        const parentTransform = this.node.parent?.getComponent(UITransform);
        let newSize = parentTransform.contentSize;
        const scale = Math.min(
            newSize.width / transform.width,
            newSize.height / transform.height
        );
        this._currentScale = scale;
        let newWidth = transform.width * scale;
        let newHeight = transform.height * scale;
        if (this._scale) {
            this.node.setScale(scale, scale);

        } else {
            transform.setContentSize(newWidth, newHeight);
        }



    }
}


