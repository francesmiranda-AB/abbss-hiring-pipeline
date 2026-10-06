import { render, screen } from '@testing-library/react';
import { Button, Field } from './kit';

it('a busy button is disabled, so Enter and Space cannot fire it twice', () => {
  render(<Button busy onClick={() => {}}>Send</Button>);
  const b = screen.getByRole('button', { name: /send/i });
  expect(b).toBeDisabled();
  expect(b).toHaveAttribute('aria-busy', 'true');
});

it('an idle button is enabled', () => {
  render(<Button>Save</Button>);
  expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
});

it('a field ties its error to the input', () => {
  render(<Field label="Reason" htmlFor="r" error="Pick a reason."><input id="r" className="ab-input" /></Field>);
  const input = screen.getByLabelText('Reason');
  const msg = screen.getByText('Pick a reason.');
  expect(input).toHaveAttribute('aria-describedby', msg.id);
});

it('a field without a hint or error adds nothing to the input', () => {
  render(<Field label="Name" htmlFor="n"><input id="n" className="ab-input" /></Field>);
  expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
});
