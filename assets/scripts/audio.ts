import { _decorator, AudioSource, Component, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('audio')
export class audio extends Component {
    @property(AudioSource)
    audioSource: AudioSource = null;

    play(){
        if (!this.audioSource.playing) {
            this.audioSource.play();
        }
    }

    mute(){
        this.audioSource.stop();
    }
}


