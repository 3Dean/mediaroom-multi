import type { ChatMessage } from '../types/chat';

export class ChatPanel {
  private readonly container: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly onSend: (body: string) => void;

  constructor(onSend: (body: string) => void) {
    this.onSend = onSend;
    this.container = document.createElement('div');
    this.container.id = 'chat-panel';
    this.container.className = 'musicspace-panel musicspace-panel--utility';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Chat';

    const status = document.createElement('div');
    status.className = 'panel-meta';
    status.textContent = 'Room messages';

    this.log = document.createElement('div');
    this.log.className = 'chat-log';

    this.form = document.createElement('form');
    this.form.className = 'chat-form';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Message the room';
    this.input.className = 'chat-input';

    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    sendButton.textContent = 'Send';
    sendButton.className = 'chat-send-button';

    this.form.append(this.input, sendButton);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = this.input.value.trim();
      if (!body) {
        return;
      }

      this.onSend(body);
      this.input.value = '';
    });

    header.append(title, status);
    this.container.append(header, this.log, this.form);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setMessages(messages: ChatMessage[]): void {
    this.log.replaceChildren(...messages.map((message) => this.createMessageRow(message)));
    this.log.scrollTop = this.log.scrollHeight;
  }

  appendMessage(message: ChatMessage): void {
    this.log.appendChild(this.createMessageRow(message));
    this.log.scrollTop = this.log.scrollHeight;
  }

  private createMessageRow(message: ChatMessage): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'chat-message';
    row.innerHTML = `<strong>${message.displayName}:</strong> ${message.body}`;
    return row;
  }
}
