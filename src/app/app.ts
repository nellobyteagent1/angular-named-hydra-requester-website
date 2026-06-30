import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Workout = {
  title: string;
  duration_minutes: number;
  focus: string;
  description: string;
};

type Tip = {
  title: string;
  detail: string;
};

type SignupResponse = {
  message: string;
};

type ContentResponse = {
  workouts: Workout[];
  tips: Tip[];
  signupCount: number;
};

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly title = 'Hydra';
  protected readonly workouts = signal<Workout[]>([]);
  protected readonly tips = signal<Tip[]>([]);
  protected readonly signupCount = signal(0);
  protected readonly loading = signal(true);
  protected readonly audioEnabled = signal(false);
  protected readonly speaking = signal(false);
  protected readonly message = signal('');

  protected name = '';
  protected email = '';
  protected goal = '';

  private audioContext: AudioContext | null = null;
  private ambientNodes: OscillatorNode[] = [];
  private ambientGain: GainNode | null = null;

  ngOnInit(): void {
    this.loadContent();
  }

  protected toggleAudio(): void {
    if (this.audioEnabled()) {
      this.stopAmbientAudio();
      this.stopVoiceGuide();
      return;
    }

    this.startAmbientAudio();
    this.playVoiceGuide();
  }

  protected playVoiceGuide(): void {
    if (!('speechSynthesis' in window)) {
      this.message.set('Voice guidance is not supported in this browser.');
      return;
    }

    const text =
      'Welcome to Hydra. Start with ten minutes of gentle movement, keep your meals balanced, drink water first, and aim for consistency instead of intensity.';
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onstart = () => this.speaking.set(true);
    utterance.onend = () => this.speaking.set(false);
    utterance.onerror = () => {
      this.speaking.set(false);
      this.message.set('Voice guidance could not start on this device.');
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  protected stopVoiceGuide(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.speaking.set(false);
  }

  protected submitSignup(): void {
    const payload = {
      name: this.name.trim(),
      email: this.email.trim(),
      goal: this.goal.trim()
    };

    if (!payload.name || !payload.email || !payload.goal) {
      this.message.set('Enter your name, email, and goal to save your reset plan.');
      return;
    }

    this.http.post<SignupResponse>('api/signups', payload).subscribe({
      next: (response) => {
        this.message.set(response.message);
        this.name = '';
        this.email = '';
        this.goal = '';
        this.loadContent();
      },
      error: () => {
        this.message.set('Hydra could not save your plan right now. Try again.');
      }
    });
  }

  private loadContent(): void {
    this.loading.set(true);
    this.http.get<ContentResponse>('api/content').subscribe({
      next: (response) => {
        this.workouts.set(response.workouts);
        this.tips.set(response.tips);
        this.signupCount.set(response.signupCount);
        this.loading.set(false);
      },
      error: () => {
        this.message.set('Hydra could not load the training plan.');
        this.loading.set(false);
      }
    });
  }

  private async startAmbientAudio(): Promise<void> {
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const gain = this.audioContext.createGain();
      gain.gain.value = 0.03;
      gain.connect(this.audioContext.destination);
      this.ambientGain = gain;

      const frequencies = [196, 246.94, 293.66];
      this.ambientNodes = frequencies.map((frequency, index) => {
        const oscillator = this.audioContext!.createOscillator();
        const oscillatorGain = this.audioContext!.createGain();
        oscillator.type = index === 1 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillatorGain.gain.value = 0.3 / (index + 1);
        oscillator.connect(oscillatorGain);
        oscillatorGain.connect(gain);
        oscillator.start();
        return oscillator;
      });

      this.audioEnabled.set(true);
      this.message.set('Calm background audio is playing. Use the voice guide anytime.');
    } catch {
      this.message.set('Browser audio requires a tap and a supported device.');
    }
  }

  private stopAmbientAudio(): void {
    this.ambientNodes.forEach((oscillator) => oscillator.stop());
    this.ambientNodes = [];
    this.ambientGain?.disconnect();
    this.ambientGain = null;
    this.audioEnabled.set(false);
    this.message.set('Audio paused.');
  }
}
