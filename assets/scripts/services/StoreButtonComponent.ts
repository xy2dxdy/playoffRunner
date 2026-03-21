import { _decorator, Button, Component, Node } from 'cc';
import super_html_playable from '../services/super_html_playable';
const { ccclass, property } = _decorator;

@ccclass('StoreButtonComponent')
export class StoreButtonComponent extends Component {

    start() {
        this.node.getComponent(Button)!.node.on(Button.EventType.CLICK, this.onClick, this);
    }

    onClick() {
        super_html_playable.game_end();
        super_html_playable.download();
    }
}

