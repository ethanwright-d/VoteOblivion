import { useState } from 'react';
import '../styles/VoteApp.css';

export type PollFormValues = {
  name: string;
  options: string[];
  start: string;
  end: string;
};

type CreatePollFormProps = {
  onSubmit: (values: PollFormValues) => Promise<void>;
  isSubmitting: boolean;
};

const emptyForm: PollFormValues = {
  name: '',
  options: ['', ''],
  start: '',
  end: '',
};

export function CreatePollForm({ onSubmit, isSubmitting }: CreatePollFormProps) {
  const [formValues, setFormValues] = useState<PollFormValues>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const handleOptionChange = (index: number, value: string) => {
    setFormValues(prev => {
      const nextOptions = [...prev.options];
      nextOptions[index] = value;
      return { ...prev, options: nextOptions };
    });
  };

  const handleAddOption = () => {
    if (formValues.options.length >= 4) return;
    setFormValues(prev => ({ ...prev, options: [...prev.options, ''] }));
  };

  const handleRemoveOption = (index: number) => {
    if (formValues.options.length <= 2) return;
    setFormValues(prev => ({
      ...prev,
      options: prev.options.filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        ...formValues,
        options: formValues.options.map(option => option.trim()),
      });
      setFormValues(emptyForm);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create poll';
      setError(message);
    }
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="poll-name">Poll name</label>
        <input
          id="poll-name"
          name="name"
          placeholder="Who should chair the next council session?"
          value={formValues.name}
          onChange={event => setFormValues(prev => ({ ...prev, name: event.target.value }))}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <label>Options (2-4)</label>
        <div className="inline-options">
          {formValues.options.map((option, index) => (
            <div className="option-field" key={`option-${index}`}>
              <input
                value={option}
                onChange={event => handleOptionChange(index, event.target.value)}
                placeholder={`Option ${index + 1}`}
                required
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleRemoveOption(index)}
                disabled={isSubmitting || formValues.options.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={handleAddOption}
            disabled={isSubmitting || formValues.options.length >= 4}
          >
            + Add option
          </button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="poll-start">Start time</label>
        <input
          id="poll-start"
          type="datetime-local"
          value={formValues.start}
          onChange={event => setFormValues(prev => ({ ...prev, start: event.target.value }))}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="poll-end">End time</label>
        <input
          id="poll-end"
          type="datetime-local"
          value={formValues.end}
          onChange={event => setFormValues(prev => ({ ...prev, end: event.target.value }))}
          required
          disabled={isSubmitting}
        />
      </div>

      {error ? <div className="info-banner error">{error}</div> : null}

      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Creating poll...' : 'Create poll'}
      </button>
    </form>
  );
}
