import { _decorator, Component, Node } from 'cc';
import super_html_playable from './super_html_playable';
const { ccclass, property } = _decorator;

@ccclass('StoreController')
export class StoreController extends Component {

    start() {
        const googlePlay = 'https://play.google.com/store/apps/details?id=ae.goragaming.playoff.blocks.game.make.earn.money.rewarded';

        super_html_playable.set_google_play_url(googlePlay);
    }
    
}

