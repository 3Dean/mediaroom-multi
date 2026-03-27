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
    this.container.className = 'musicspace-panel';

    const title = document.createElement('div');
    title.textContent = 'Room Chat';
    title.style.color = '#fff';
    title.style.fontSize = '14px';
    title.style.fontWeight = '700';

    this.log = document.createElement('div');
    this.log.style.display = 'flex';
    this.log.style.flexDirection = 'column';
    this.log.style.gap = '6px';
    this.log.style.minHeight = '140px';
    this.log.style.maxHeight = '220px';
    this.log.style.overflowY = 'auto';

    this.form = document.createElement('form');
    this.form.style.display = 'flex';
    this.form.style.gap = '8px';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Type a message';
    this.input.style.flex = '1';
    this.input.style.padding = '8px 10px';
    this.input.style.borderRadius = '8px';
    this.input.style.border = '1px solid rgba(255, 255, 255, 0.14)';

    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    sendButton.textContent = 'Send';

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

    this.container.append(title, this.log, this.form);
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
    row.style.color = '#fff';
    row.style.fontSize = '12px';
    row.innerHTML = `<strong>${message.displayName}:</strong> ${message.body}`;
    return row;
  }
}
