import { _decorator, Node, Size } from 'cc';
import { DynamicUI } from './DynamicUI';
import { GameOrientation } from './GameOrientation';
import { property } from '../property';
const { ccclass } = _decorator;

/** Показывает один из двух дочерних вариантов UI: портретный или альбомный. */
@ccclass('OrientationVariantSwitcher')
export class OrientationVariantSwitcher extends DynamicUI {
    @property({ type: Node, tooltip: 'Узел для вертикали (портрет)' })
    portraitNode: Node | null = null;

    @property({ type: Node, tooltip: 'Узел для горизонтали (альбом)' })
    landscapeNode: Node | null = null;

    @property({
        tooltip:
            'Вкл.: видимость по ориентации экрана. Выкл.: всегда один из вариантов (см. «Показывать портрет»).',
    })
    useOrientation: boolean = true;

    @property({
        visible(this: OrientationVariantSwitcher) {
            return !this.useOrientation;
        },
        tooltip: 'Когда «по ориентации» выключено — какой вариант оставить видимым.',
    })
    showPortraitWhenFixed: boolean = true;

    protected start(): void {
        this.applyVisibility();
    }

    public override onResize(newSize: Size = new Size()): void {
        super.onResize(newSize);
        this.scheduleOnce(() => this.applyVisibility(), 0);
    }

    private applyVisibility(): void {
        let showPortrait: boolean;
        if (this.useOrientation) {
            showPortrait = GameOrientation.isPort;
        } else {
            showPortrait = this.showPortraitWhenFixed;
        }
        if (this.portraitNode) {
            this.portraitNode.active = showPortrait;
        }
        if (this.landscapeNode) {
            this.landscapeNode.active = !showPortrait;
        }
    }
}
