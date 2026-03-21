import { _decorator, Size, Layout, Enum } from 'cc';
import { DynamicUI } from './DynamicUI';
import { GameOrientation } from './GameOrientation';
import { FitImage } from './FitImage';
import { property } from '../property';
const { ccclass } = _decorator;

// Свойства Layout для портретной ориентации
@ccclass('PortraitLayoutProperties')
export class PortraitLayoutProperties {
    @property({ type: Enum(Layout.Type) })
    _type: Layout.Type = Layout.Type.VERTICAL;

    @property(Number)
    _spacingX: number = 0;

    @property(Number)
    _spacingY: number = 0;

    @property(Number)
    _paddingLeft: number = 0;

    @property(Number)
    _paddingRight: number = 0;

    @property(Number)
    _paddingTop: number = 0;

    @property(Number)
    _paddingBottom: number = 0;

    @property({ type: Enum(Layout.VerticalDirection) })
    _verticalDirection: Layout.VerticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;

    @property({ type: Enum(Layout.HorizontalDirection) })
    _horizontalDirection: Layout.HorizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
}

// Свойства Layout для альбомной ориентации
@ccclass('LandscapeLayoutProperties')
export class LandscapeLayoutProperties {
    @property({ type: Enum(Layout.Type) })
    _type: Layout.Type = Layout.Type.HORIZONTAL;

    @property(Number)
    _spacingX: number = 0;

    @property(Number)
    _spacingY: number = 0;

    @property(Number)
    _paddingLeft: number = 0;

    @property(Number)
    _paddingRight: number = 0;

    @property(Number)
    _paddingTop: number = 0;

    @property(Number)
    _paddingBottom: number = 0;

    @property({ type: Enum(Layout.VerticalDirection) })
    _verticalDirection: Layout.VerticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;

    @property({ type: Enum(Layout.HorizontalDirection) })
    _horizontalDirection: Layout.HorizontalDirection = Layout.HorizontalDirection.LEFT_TO_RIGHT;
}

@ccclass('OrientationChanger')
export class OrientationChanger extends DynamicUI {
    // === PORTRAIT ===
    @property({ type: PortraitLayoutProperties, group: "Portrait" })
    _portraitProperties: PortraitLayoutProperties = new PortraitLayoutProperties();

    // === LANDSCAPE ===
    @property({ type: LandscapeLayoutProperties, group: "Landscape" })
    _landscapeProperties: LandscapeLayoutProperties = new LandscapeLayoutProperties();

    private _layout: Layout | null = null;

    protected override start(): void {
        this._layout = this.node.getComponent(Layout);
        if (!this._layout) {
        }
        this.onResize();
    }

    public override onResize(newSize: Size = new Size()): void {
        super.onResize(newSize);
        this.scheduleOnce(() => {


            // GameOrientation.setResize(newSize);

            if (!this._layout) {
                return;
            }

            // Определяем ориентацию
            const isPortrait = GameOrientation.isPort;

            // Выбираем соответствующие свойства
            const properties = isPortrait ? this._portraitProperties : this._landscapeProperties;

            // Применяем свойства Layout
            this.applyLayoutProperties(properties);
        }, 0);
    }

    private applyLayoutProperties(properties: PortraitLayoutProperties | LandscapeLayoutProperties): void {
        if (!this._layout) {
            return;
        }

        this._layout.type = properties._type;
        this._layout.spacingX = properties._spacingX;
        this._layout.spacingY = properties._spacingY;
        this._layout.paddingLeft = properties._paddingLeft;
        this._layout.paddingRight = properties._paddingRight;
        this._layout.paddingTop = properties._paddingTop;
        this._layout.paddingBottom = properties._paddingBottom;
        this._layout.verticalDirection = properties._verticalDirection;
        this._layout.horizontalDirection = properties._horizontalDirection;

        // Обновляем layout
        this._layout.updateLayout();
        var fitters = this.getComponentsInChildren(FitImage);
        fitters.forEach(fitter => {
            fitter.onResize();
        });
    }
}

