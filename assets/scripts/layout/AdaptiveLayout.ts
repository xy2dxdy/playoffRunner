import { _decorator, Size, UITransform, Vec3, Widget, Enum, SpriteFrame, Sprite } from 'cc';
import { DynamicUI } from './DynamicUI';
import { GameOrientation } from './GameOrientation';
import { property } from '../property';
const { ccclass } = _decorator;

// Enum для соотношений сторон
export enum AspectRatio {
    emn_4_3 = 0,    // 4:3 = 1.33 480 × 360
    mn_3_2 = 1,     // 3:2 = 1.5 540 × 360
    xsm_16_10 = 2,  // 16:10 = 1.6 576 × 360
    sm_5_3 = 3,     // 5:3 = 1.67 600 × 360
    md_16_9 = 4,    // 16:9 = 1.78 640 × 360
    lg_16_8 = 5,    // 16:8 = 2.0 720 × 360
    xlg_19_5_9 = 6  // 19.5:9 = 2.17 780 × 360
}

// Получение числового значения соотношения сторон
export function getAspectRatioValue(ratio: AspectRatio): number {
    switch (ratio) {
        case AspectRatio.emn_4_3: return 4 / 3;
        case AspectRatio.mn_3_2: return 3 / 2;
        case AspectRatio.xsm_16_10: return 16 / 10;
        case AspectRatio.sm_5_3: return 5 / 3;
        case AspectRatio.md_16_9: return 16 / 9;
        case AspectRatio.lg_16_8: return 16 / 8;
        case AspectRatio.xlg_19_5_9: return 19.5 / 9;
        default: return 1;
    }
}



@ccclass('WidgetProperties')
export class WidgetProperties {
    @property(Boolean) _isAlignTop: boolean = false;
    @property(Boolean) _isAlignBottom: boolean = false;
    @property(Boolean) _isAlignLeft: boolean = false;
    @property(Boolean) _isAlignRight: boolean = false;
    @property(Boolean) _isAlignVerticalCenter: boolean = false;
    @property(Boolean) _isAlignHorizontalCenter: boolean = false;
    @property(Number) _top: number = 0;
    @property(Number) _bottom: number = 0;
    @property(Number) _left: number = 0;
    @property(Number) _right: number = 0;
    @property(Number) _horizontalCenter: number = 0;
    @property(Number) _verticalCenter: number = 0;
}

@ccclass('TransformProperties')
export class TransformProperties {
    @property(Number) _width: number = 0;
    @property(Number) _height: number = 0;
}

@ccclass('NodeProperties')
export class NodeProperties {
    @property(Vec3) _scale: Vec3 = Vec3.ONE.clone();
    @property(Vec3) _position: Vec3 = Vec3.ZERO.clone();
}

@ccclass('SpriteProperties')
export class SpriteProperties {
    @property(SpriteFrame) _sprite!: SpriteFrame;
}

// Основной класс адаптивного объекта
@ccclass('AdaptiveObject')
export class AdaptiveObject {
    @property({ type: Enum(AspectRatio) })
    _aspectRatio: AspectRatio = AspectRatio.md_16_9;

    @property(Boolean) _enableWidget: boolean = true;
    @property({ type: WidgetProperties, visible(this: AdaptiveObject) { return this._enableWidget; } })
    _widgetProperties: WidgetProperties = new WidgetProperties();

    @property(Boolean) _enableNode: boolean = false;
    @property({ type: NodeProperties, visible(this: AdaptiveObject) { return this._enableNode; } })
    _nodeProperties: NodeProperties = new NodeProperties();

    @property(Boolean) _enableTransform: boolean = false;
    @property({ type: TransformProperties, visible(this: AdaptiveObject) { return this._enableTransform; } })
    _transformProperties: TransformProperties = new TransformProperties();

    @property(Boolean) _enableSprite: boolean = false;
    @property({ type: SpriteProperties, visible(this: AdaptiveObject) { return this._enableSprite; } })
    _spriteProperties: SpriteProperties = new SpriteProperties();
}

// Класс для группы объектов (landscape или portrait)
@ccclass('AdaptiveGroup')
export class AdaptiveGroup {
    @property([AdaptiveObject])
    _aspectRatios: AdaptiveObject[] = [];
}


@ccclass('AdaptiveLayout')
export class AdaptiveLayout extends DynamicUI {
    // === PORTRAIT ===
    @property({ type: AdaptiveGroup, group: "Portrait" })
    _portraitLayouts: AdaptiveGroup = new AdaptiveGroup();

    // === LANDSCAPE ===
    @property({ type: AdaptiveGroup, group: "Landscape" })
    _landscapeLayouts: AdaptiveGroup = new AdaptiveGroup();


    public override onResize(newSize: Size = new Size()): void {
        super.onResize(newSize);

        GameOrientation.setResize(newSize);

        // Определяем ориентацию
        const isPortrait = GameOrientation.isPort;

        // Выбираем соответствующую группу
        const targetGroup = isPortrait ? this._portraitLayouts : this._landscapeLayouts;

        // Находим подходящий объект и применяем его настройки
        const targetObject = this.findMatchingObject(targetGroup, newSize, isPortrait);

        if (targetObject) {
            this.applyObjectProperties(targetObject);
        }

        // Принудительно обновляем компоновку
        const widget = this.node.getComponent(Widget);
        if (widget) {
            widget.updateAlignment();
        }
    }

    // Находит подходящий объект на основе соотношения сторон
    private findMatchingObject(group: AdaptiveGroup, size: Size, isPortrait: boolean): AdaptiveObject | null {
        if (!group._aspectRatios || group._aspectRatios.length === 0) {
            return null;
        }

        // Вычисляем текущее соотношение сторон (приводим к виду большее/меньшее)
        const currentAspectRatio = Math.max(size.width, size.height) / Math.min(size.width, size.height);

        // Сортируем объекты по соотношению сторон (от меньшего к большему)
        const sortedObjects = [...group._aspectRatios].sort((a, b) => {
            const ratioA = getAspectRatioValue(a._aspectRatio);
            const ratioB = getAspectRatioValue(b._aspectRatio);
            return ratioA - ratioB; // Обычный порядок сортировки
        });

        // Находим наибольший объект, где соотношение сторон <= текущего
        let bestMatch: AdaptiveObject | null = null;
        for (const obj of sortedObjects) {
            const objAspectRatio = getAspectRatioValue(obj._aspectRatio);
            if (objAspectRatio <= currentAspectRatio) {
                bestMatch = obj; // Запоминаем как лучший вариант
            }
        }

        if (bestMatch) {
            return bestMatch;
        }

        // Если не нашли подходящий, ищем emn_4_3 как значение по умолчанию
        const defaultObject = sortedObjects.find(obj => obj._aspectRatio === AspectRatio.emn_4_3);
        if (defaultObject) {
            return defaultObject;
        }

        // Если emn_4_3 не найден, возвращаем последний (с наименьшим соотношением)
        return sortedObjects[sortedObjects.length - 1] || null;
    }

    // Применяет свойства найденного объекта
    private applyObjectProperties(obj: AdaptiveObject): void {
        if (obj._enableNode && obj._nodeProperties) {
            this.applyNodeProperties(obj._nodeProperties);
        }

        if (obj._enableTransform && obj._transformProperties) {
            this.applyTransformProperties(obj._transformProperties);
        }

        if (obj._enableWidget && obj._widgetProperties) {
            const widget = this.node.getComponent(Widget);
            if (widget) {
                this.applyWidgetProperties(widget, obj._widgetProperties);
            }
        }

        if(obj._enableSprite && obj._spriteProperties){
            this,this.applySpriteProperties(obj._spriteProperties);
        }
    }

    private applyNodeProperties(properties: NodeProperties): void {
        this.node.position = properties._position.clone();
        this.node.scale = properties._scale.clone();
    }

    private applyTransformProperties(properties: TransformProperties): void {
        const transform = this.node.getComponent(UITransform);
        if (transform) {
            if (properties._width > 0) {
                transform.width = properties._width;
            }
            if (properties._height > 0) {
                transform.height = properties._height;
            }
        }
    }

    private applyWidgetProperties(widget: Widget, properties: WidgetProperties): void {
        widget.isAlignTop = properties._isAlignTop;
        widget.isAlignBottom = properties._isAlignBottom;
        widget.isAlignLeft = properties._isAlignLeft;
        widget.isAlignRight = properties._isAlignRight;
        widget.isAlignVerticalCenter = properties._isAlignVerticalCenter;
        widget.isAlignHorizontalCenter = properties._isAlignHorizontalCenter;
        widget.top = properties._top;
        widget.bottom = properties._bottom;
        widget.left = properties._left;
        widget.right = properties._right;
        widget.horizontalCenter = properties._horizontalCenter;
        widget.verticalCenter = properties._verticalCenter;
    }

    private applySpriteProperties(properties: SpriteProperties){
        if(properties._sprite){
            this.node.active = true;
            this.getComponent(Sprite)!.spriteFrame = properties._sprite.clone();
        }
        else
            this.node.active = false;
    }
}