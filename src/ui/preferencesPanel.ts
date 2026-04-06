import type { UserPreferences } from '../preferences/preferencesModel';
import { createSectionIcon } from './sectionIcons';

type StationOption = {
  label: string;
  mood: string;
};

type PreferencesPanelOptions = {
  initialPreferences: UserPreferences;
  stationOptions: StationOption[];
  onSave: (preferences: UserPreferences) => void;
  onReset: () => UserPreferences;
};

const BACKGROUND_OPTIONS = [
  { value: '', label: 'Follow Station Mood' },
  { value: 'beat', label: 'Beat' },
  { value: 'chill', label: 'Chill' },
  { value: 'dark', label: 'Dark' },
  { value: 'defcon', label: 'Defcon' },
  { value: 'drone', label: 'Drone' },
  { value: 'dubstep', label: 'Dubstep' },
  { value: 'indie', label: 'Indie' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'metal', label: 'Metal' },
  { value: 'space', label: 'Space' },
];

const AVATAR_OPTIONS = [
  { value: '', label: 'Default Avatar' },
  { value: 'observer', label: 'Observer' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'signal', label: 'Signal' },
];

export class PreferencesPanel {
  private readonly container: HTMLDetailsElement;
  private readonly displayNameInput: HTMLInputElement;
  private readonly roomInput: HTMLInputElement;
  private readonly stationSelect: HTMLSelectElement;
  private readonly volumeInput: HTMLInputElement;
  private readonly volumeValue: HTMLSpanElement;
  private readonly backgroundSelect: HTMLSelectElement;
  private readonly avatarSelect: HTMLSelectElement;
  private readonly noteLabel: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly summaryMeta: HTMLSpanElement;
  private readonly onSave: (preferences: UserPreferences) => void;
  private readonly onReset: () => UserPreferences;

  constructor(options: PreferencesPanelOptions) {
    this.onSave = options.onSave;
    this.onReset = options.onReset;
    this.container = document.createElement('details');
    this.container.id = 'preferences-panel';
    this.container.className = 'musicspace-accordion musicspace-card--preferences';

    const summary = document.createElement('summary');
    summary.className = 'musicspace-accordion-summary';

    const summaryLeft = document.createElement('span');
    summaryLeft.className = 'musicspace-accordion-title-wrap';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = 'Preferences';
    summaryLeft.append(createSectionIcon('preferences'), summaryLabel);

    this.summaryMeta = document.createElement('span');
    this.summaryMeta.className = 'musicspace-accordion-meta';
    this.summaryMeta.textContent = 'Avatar · Volume · Background';
    summary.append(summaryLeft, this.summaryMeta);

    const form = document.createElement('form');
    form.className = 'musicspace-field-stack';

    this.displayNameInput = this.createTextInput('Default display name');
    this.roomInput = this.createTextInput('Default room name');
    this.stationSelect = this.createSelect([{ value: '', label: 'Keep Current Default' }, ...options.stationOptions.map((station) => ({ value: station.mood, label: station.label }))], 'Station');
    this.volumeInput = document.createElement('input');
    this.volumeInput.type = 'range';
    this.volumeInput.min = '0';
    this.volumeInput.max = '1';
    this.volumeInput.step = '0.05';
    this.volumeInput.className = 'musicspace-slider';
    this.volumeValue = document.createElement('span');
    this.volumeValue.className = 'musicspace-inline-note';

    const volumeWrap = document.createElement('label');
    volumeWrap.className = 'musicspace-field';
    const volumeLabel = document.createElement('span');
    volumeLabel.textContent = 'Default volume';
    volumeWrap.append(volumeLabel, this.volumeInput, this.volumeValue);

    this.backgroundSelect = this.createSelect(BACKGROUND_OPTIONS, 'Background override');
    this.avatarSelect = this.createSelect(AVATAR_OPTIONS, 'Avatar preset');

    const avatarNote = document.createElement('div');
    avatarNote.className = 'musicspace-inline-note';
    avatarNote.textContent = 'Re-enter the room after changing avatars so others see it.';

    const actions = document.createElement('div');
    actions.className = 'musicspace-button-row';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save Preferences';
    saveButton.className = 'musicspace-button musicspace-button--primary';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset';
    resetButton.className = 'musicspace-button musicspace-button--secondary';
    resetButton.addEventListener('click', () => {
      const reset = this.onReset();
      this.setValues(reset);
      this.noteLabel.textContent = 'Preferences reset to defaults.';
    });
    actions.append(saveButton, resetButton);

    this.noteLabel = document.createElement('div');
    this.noteLabel.className = 'musicspace-inline-note';
    this.noteLabel.textContent = 'Saved locally. Leave fields blank to keep using the live join form.';

    this.volumeInput.addEventListener('input', () => {
      this.volumeValue.textContent = `${Math.round(Number(this.volumeInput.value) * 100)}%`;
    });

    form.append(
      this.wrapField('Default display name', this.displayNameInput),
      this.wrapField('Default room name', this.roomInput),
      this.wrapField('Preferred station', this.stationSelect),
      volumeWrap,
      this.wrapField('Background override', this.backgroundSelect),
      this.wrapField('Avatar preset', this.avatarSelect),
      avatarNote,
      actions,
    );

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const preferences: UserPreferences = {
        profile: {
          displayName: this.displayNameInput.value.trim(),
          avatarPresetId: (this.avatarSelect.value || null) as UserPreferences['profile']['avatarPresetId'],
        },
        room: {
          defaultRoomSlug: this.roomInput.value.trim(),
        },
        audio: {
          preferredStationMood: this.stationSelect.value || null,
          defaultVolume: Number(this.volumeInput.value),
        },
        visuals: {
          backgroundOverrideMood: this.backgroundSelect.value || null,
        },
      };

      this.onSave(preferences);
      this.noteLabel.textContent = 'Preferences saved locally.';
    });

    this.content = document.createElement('div');
    this.content.className = 'musicspace-accordion-body';
    this.content.append(form, this.noteLabel);

    this.container.append(summary, this.content);
    this.container.open = false;
    this.setValues(options.initialPreferences);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setValues(preferences: UserPreferences): void {
    this.displayNameInput.value = preferences.profile.displayName;
    this.roomInput.value = preferences.room.defaultRoomSlug;
    this.stationSelect.value = preferences.audio.preferredStationMood ?? '';
    this.volumeInput.value = String(preferences.audio.defaultVolume);
    this.volumeValue.textContent = `${Math.round(preferences.audio.defaultVolume * 100)}%`;
    this.backgroundSelect.value = preferences.visuals.backgroundOverrideMood ?? '';
    this.avatarSelect.value = preferences.profile.avatarPresetId ?? '';
  }

  private createTextInput(placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = 'musicspace-input';
    return input;
  }

  private createSelect(options: Array<{ value: string; label: string }>, ariaLabel: string): HTMLSelectElement {
    const select = document.createElement('select');
    select.className = 'musicspace-input';
    select.setAttribute('aria-label', ariaLabel);
    options.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.appendChild(optionElement);
    });
    return select;
  }

  private wrapField(labelText: string, element: HTMLElement): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'musicspace-field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, element);
    return label;
  }
}



