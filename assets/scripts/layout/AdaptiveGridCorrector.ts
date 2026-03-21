import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CenteredGridLayout')
export class CenteredGridLayout extends Component {
    @property
    spacingX: number = 10; // Горизонтальный промежуток между элементами

    @property
    spacingY: number = 10; // Вертикальный промежуток между элементами

    @property
    columns: number = 3; // Количество колонок в сетке

    @property
    alignment: 'horizontal' | 'vertical' = 'horizontal'; // Ориентация заполнения

    protected override onLoad() {
        this.updateLayout();
    }

    updateLayout() {
        const children = this.node.children;
        const containerTransform = this.node.getComponent(UITransform);
        if (!containerTransform) {
            console.error('UITransform component is missing on the container node!');
            return;
        }

        const containerWidth = containerTransform.width;
        const containerHeight = containerTransform.height;

        const childCount = children.length;
        const rows = Math.ceil(childCount / this.columns);

        const positions: { x: number; y: number }[] = [];

        // Определение размеров первого дочернего элемента
        const firstChild = children[0]?.getComponent(UITransform);
        if (!firstChild) {
            return;
        }
        const childWidth = firstChild.width;
        const childHeight = firstChild.height;

        const totalWidth =
            this.columns * childWidth + (this.columns - 1) * this.spacingX;
        const totalHeight =
            rows * childHeight + (rows - 1) * this.spacingY;

        // Начальные координаты для центрирования
        let startX = -(totalWidth / 2) + childWidth / 2;
        let startY = totalHeight / 2 - childHeight / 2;

        for (let i = 0; i < childCount; i++) {
            const col = i % this.columns;
            const row = Math.floor(i / this.columns);

            const posX = startX + col * (childWidth + this.spacingX);
            const posY = startY - row * (childHeight + this.spacingY);

            positions.push({ x: posX, y: posY });
        }

        // Применение рассчитанных позиций
        for (let i = 0; i < childCount; i++) {
            const child = children[i];
            const position = positions[i];
            child.setPosition(position.x, position.y);
        }
    }

    // Автообновление при изменении
    onEnable() {
        this.node.on(Node.EventType.CHILD_ADDED, this.updateLayout, this);
        this.node.on(Node.EventType.CHILD_REMOVED, this.updateLayout, this);
    }

    onDisable() {
        this.node.off(Node.EventType.CHILD_ADDED, this.updateLayout, this);
        this.node.off(Node.EventType.CHILD_REMOVED, this.updateLayout, this);
    }
}
