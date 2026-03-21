import { _decorator, Component, AudioClip, AudioSource, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SoundController')
export class SoundController extends Component {

    public static instance: SoundController;

    private _packshotMode: boolean = false;

    @property(AudioSource)
    private audioSource: AudioSource = null!;

    /** Клипы fail/packshot — этот источник не глушим, чтобы слышны были финальные звуки */
    @property(AudioSource)
    private audioSourcePackshot: AudioSource = null!;

    @property({
        type: [AudioSource],
        tooltip: 'Дополнительно остановить (например музыка на другом узле). Если пусто — всё равно ищем все AudioSource в сцене',
    })
    private extraAudioSourcesToMute: AudioSource[] = [];

    @property({type:AudioClip})
    public girlHit: AudioClip = null;

    @property({type:AudioClip})
    public fail: AudioClip = null;

    @property({type:AudioClip})
    public jump: AudioClip = null;
    
    @property({type:AudioClip})
    public money: AudioClip = null;

    @property({type:AudioClip})
    public packshot: AudioClip = null;

    onLoad() {
        SoundController.instance = this;
    }

    play(clip: AudioClip | null) {
        if (!clip || !this.audioSource) return;
        this.audioSource.playOneShot(clip, 1);
    }

    public enterPackshotMode() {
        this._packshotMode = true;
        this.stopAllGameplayAudio();
    }

    /**
     * Останавливает игровой звук и музыку: не только audioSource в этом компоненте,
     * но и любые другие AudioSource в сцене (кроме канала packshot/fail).
     */
    private stopAllGameplayAudio(): void {
        for (const src of this.extraAudioSourcesToMute) {
            if (src) this.muteSource(src);
        }

        const scene = director.getScene();
        if (scene) {
            const all = scene.getComponentsInChildren(AudioSource);
            for (const src of all) {
                if (!src || src === this.audioSourcePackshot) continue;
                this.muteSource(src);
            }
        } else {
            if (this.audioSource) this.muteSource(this.audioSource);
        }

        if (this.audioSourcePackshot) {
            this.audioSourcePackshot.volume = 1;
        }
    }

    private muteSource(src: AudioSource): void {
        src.stop();
        src.volume = 0;
    }

    public playPackshot() {
        if (!this.packshot || !this.audioSourcePackshot) return;
        this.stopAllGameplayAudio();
        this.audioSourcePackshot.volume = 1;
        this.audioSourcePackshot.playOneShot(this.packshot, 1);
    }

    playJump() {
        this.play(this.jump);
    }

    playGirlHit() {
        this.play(this.girlHit);
    }

    playMoney() {
        this.play(this.money);
    }

    playFail() {
        if (!this.fail || !this.audioSourcePackshot) return;
        this.stopAllGameplayAudio();
        this.audioSourcePackshot.volume = 1;
        this.audioSourcePackshot.playOneShot(this.fail, 1);
    }

}
