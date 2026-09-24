// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actions } from '../lib/store'
import { BlockRunner } from './BlockRunner'

// Block w1d1:A has one Item (W1D1-A1), so it is the smallest Block to exercise Commit rules on.
const KEY = 'w1d1:A'
const commitButton = () => screen.getByRole('button', { name: /Commit block/ })

describe('Skip flag and blank commit', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
  })
  afterEach(cleanup)

  it('an unflagged blank Item cannot be committed', () => {
    render(<BlockRunner blockKey={KEY} />)
    expect(commitButton()).toBeDisabled()
  })

  it('a flagged Item commits blank with no confidence, and the Key then appears', async () => {
    const user = userEvent.setup()
    const { container } = render(<BlockRunner blockKey={KEY} />)
    await user.click(screen.getByRole('button', { name: /^Skip/ }))
    // The flag is not an answer: the box stays empty.
    expect(screen.getByPlaceholderText('Your answer')).toHaveValue('')
    expect(commitButton()).toBeEnabled()

    await user.click(commitButton())
    expect(container.querySelector('.key')).not.toBeNull()
    expect(screen.getByText(/Skipped/)).toBeInTheDocument()
    // A blank skipped Item has nothing to score, so the Block completes on its own.
    expect(screen.getByText('Block complete')).toBeInTheDocument()
  })

  it('un-flagging restores the requirement for an answer and confidence', async () => {
    const user = userEvent.setup()
    render(<BlockRunner blockKey={KEY} />)
    await user.click(screen.getByRole('button', { name: /^Skip/ }))
    expect(commitButton()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /Skipped/ }))
    expect(commitButton()).toBeDisabled()
  })
})
