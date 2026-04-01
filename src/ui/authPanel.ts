type AuthPanelOptions = {
  initialLoginId?: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean; message: string }>;
  onConfirm: (email: string, code: string) => Promise<void>;
  onSignOut: () => Promise<void>;
};

export class AuthPanel {
  private readonly container: HTMLDivElement;
  private readonly loggedInView: HTMLDivElement;
  private readonly loggedOutView: HTMLDivElement;
  private readonly statusLabel: HTMLDivElement;
  private readonly emailInput: HTMLInputElement;
  private readonly passwordInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly signInButton: HTMLButtonElement;
  private readonly signUpButton: HTMLButtonElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly signOutButton: HTMLButtonElement;
  private readonly accountLabel: HTMLDivElement;
  private readonly options: AuthPanelOptions;
  private pendingConfirmationEmail: string | null = null;

  constructor(options: AuthPanelOptions) {
    this.options = options;
    this.container = document.createElement('div');
    this.container.id = 'auth-panel';
    this.container.className = 'musicspace-panel musicspace-panel--secondary';

    const header = document.createElement('div');
    header.className = 'panel-header';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'Account';

    this.statusLabel = document.createElement('div');
    this.statusLabel.className = 'panel-status auth-status';
    this.statusLabel.textContent = 'Sign in for ownership and moderation access.';

    this.loggedOutView = document.createElement('div');
    this.loggedOutView.className = 'auth-form';

    this.emailInput = document.createElement('input');
    this.emailInput.type = 'email';
    this.emailInput.placeholder = 'Email';
    this.emailInput.autocomplete = 'username';

    this.passwordInput = document.createElement('input');
    this.passwordInput.type = 'password';
    this.passwordInput.placeholder = 'Password';
    this.passwordInput.autocomplete = 'current-password';

    this.codeInput = document.createElement('input');
    this.codeInput.type = 'text';
    this.codeInput.placeholder = 'Confirmation code';
    this.codeInput.style.display = 'none';

    this.signInButton = document.createElement('button');
    this.signInButton.type = 'button';
    this.signInButton.textContent = 'Sign In';
    this.signInButton.className = 'auth-primary-action';
    this.signInButton.addEventListener('click', () => {
      void this.handleSignIn();
    });

    this.signUpButton = document.createElement('button');
    this.signUpButton.type = 'button';
    this.signUpButton.textContent = 'Create account';
    this.signUpButton.className = 'auth-secondary-action';
    this.signUpButton.addEventListener('click', () => {
      void this.handleSignUp();
    });

    this.confirmButton = document.createElement('button');
    this.confirmButton.type = 'button';
    this.confirmButton.textContent = 'Confirm Email';
    this.confirmButton.className = 'auth-secondary-action';
    this.confirmButton.style.display = 'none';
    this.confirmButton.addEventListener('click', () => {
      void this.handleConfirm();
    });

    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'auth-secondary-actions';
    secondaryActions.append(this.signUpButton, this.confirmButton);

    this.loggedOutView.append(
      this.emailInput,
      this.passwordInput,
      this.codeInput,
      this.signInButton,
      secondaryActions,
    );

    this.loggedInView = document.createElement('div');
    this.loggedInView.className = 'auth-signed-in';

    this.accountLabel = document.createElement('div');
    this.accountLabel.className = 'auth-account';

    this.signOutButton = document.createElement('button');
    this.signOutButton.type = 'button';
    this.signOutButton.textContent = 'Sign Out';
    this.signOutButton.addEventListener('click', () => {
      void this.handleSignOut();
    });

    this.loggedInView.append(this.accountLabel, this.signOutButton);
    header.append(title, this.statusLabel);
    this.container.append(header, this.loggedOutView, this.loggedInView);
    this.setUser(options.initialLoginId ?? null);
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.container);
  }

  setUser(loginId: string | null): void {
    const signedIn = Boolean(loginId);
    this.loggedOutView.style.display = signedIn ? 'none' : 'grid';
    this.loggedInView.style.display = signedIn ? 'grid' : 'none';
    this.accountLabel.textContent = loginId ? `Signed in as ${loginId}` : '';
    if (signedIn) {
      this.setStatus('Signed in. Re-enter only if you joined earlier as a guest.');
      this.resetConfirmationState();
    } else {
      this.setStatus('Sign in for ownership and moderation access.');
    }
  }

  setStatus(message: string): void {
    this.statusLabel.textContent = message;
  }

  private async handleSignIn(): Promise<void> {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    if (!email || !password) {
      this.setStatus('Email and password are required.');
      return;
    }

    this.setBusy(true);
    try {
      await this.options.onSignIn(email, password);
      this.passwordInput.value = '';
    } catch (error) {
      this.setStatus(getErrorMessage(error, 'Unable to sign in.'));
    } finally {
      this.setBusy(false);
    }
  }

  private async handleSignUp(): Promise<void> {
    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;
    if (!email || !password) {
      this.setStatus('Email and password are required.');
      return;
    }

    this.setBusy(true);
    try {
      const result = await this.options.onSignUp(email, password);
      this.setStatus(result.message);
      if (result.needsConfirmation) {
        this.pendingConfirmationEmail = email;
        this.codeInput.style.display = 'block';
        this.confirmButton.style.display = 'inline-flex';
      }
    } catch (error) {
      this.setStatus(getErrorMessage(error, 'Unable to sign up.'));
    } finally {
      this.setBusy(false);
    }
  }

  private async handleConfirm(): Promise<void> {
    const email = this.pendingConfirmationEmail ?? this.emailInput.value.trim();
    const code = this.codeInput.value.trim();
    if (!email || !code) {
      this.setStatus('Email and confirmation code are required.');
      return;
    }

    this.setBusy(true);
    try {
      await this.options.onConfirm(email, code);
      this.setStatus('Email confirmed. You can now sign in.');
      this.resetConfirmationState();
    } catch (error) {
      this.setStatus(getErrorMessage(error, 'Unable to confirm sign up.'));
    } finally {
      this.setBusy(false);
    }
  }

  private async handleSignOut(): Promise<void> {
    this.setBusy(true);
    try {
      await this.options.onSignOut();
    } catch (error) {
      this.setStatus(getErrorMessage(error, 'Unable to sign out.'));
    } finally {
      this.setBusy(false);
    }
  }

  private resetConfirmationState(): void {
    this.pendingConfirmationEmail = null;
    this.codeInput.value = '';
    this.codeInput.style.display = 'none';
    this.confirmButton.style.display = 'none';
  }

  private setBusy(busy: boolean): void {
    this.emailInput.disabled = busy;
    this.passwordInput.disabled = busy;
    this.codeInput.disabled = busy;
    this.signInButton.disabled = busy;
    this.signUpButton.disabled = busy;
    this.confirmButton.disabled = busy;
    this.signOutButton.disabled = busy;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
