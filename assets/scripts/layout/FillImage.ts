import { _decorator, Component, Size, Sprite, UITransform, view } from 'cc';
import { DynamicUI } from './DynamicUI';
const { ccclass } = _decorator;
import { property } from "../property";
@ccclass('FillImage')
export class FillImage extends DynamicUI {

    @property(Boolean)
    private _scale: boolean = false;





    public override onResize(s: Size = new Size()) {
        super.onResize(s);
        if (this.node.scale.x === 0 || this.node.scale.y === 0) return;
        const transform = this.node.getComponent(UITransform);
        const parentTransform = this.node.parent?.getComponent(UITransform);
        let newSize = parentTransform.contentSize;
        const scale = Math.max(
            newSize.width / transform.width,
            newSize.height / transform.height
        );
        let newWidth = transform.width * scale;
        let newHeight = transform.height * scale;
        if (this._scale) {
            this.node.setScale(scale, scale);
        } else {
            transform.setContentSize(newWidth, newHeight);
        }

    }
}

