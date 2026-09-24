// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actions } from '../lib/store'
import { BlockRunner } from './BlockRunner'

const KEY = 'w1d1:A'
const KEY_TEXT = /2x\+1/

async function fillAndCommit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Your answer'), '79, 720, 70')
  await user.click(screen.getByRole('button', { name: '3' }))
  await user.click(screen.getByRole('button', { name: /Commit block/ }))
}

describe('BlockRunner Discipline Rule', () => {
  beforeEach(() => {
    localStorage.clear()
    actions.reset()
  })
  afterEach(cleanup)

  it('renders no Key before Commit', async () => {
    const user = userEvent.setup()
    const { container } = render(<BlockRunner blockKey={KEY} />)
    expect(container.querySelector('.key')).toBeNull()
    expect(screen.queryByText(KEY_TEXT)).toBeNull()

    // Still hidden with a full draft, until Commit is pressed.
    await user.type(screen.getByPlaceholderText('Your answer'), '79, 720, 70')
    await user.click(screen.getByRole('button', { name: '3' }))
    expect(container.querySelector('.key')).toBeNull()
    expect(screen.queryByText(KEY_TEXT)).toBeNull()

    await user.click(screen.getByRole('button', { name: /Commit block/ }))
    expect(container.querySelector('.key')).not.toBeNull()
    expect(screen.getByText(KEY_TEXT)).toBeInTheDocument()
  })

  it('a retry hides the Key again until Commit', async () => {
    const user = userEvent.setup()
    const { container } = render(<BlockRunner blockKey={KEY} />)
    await fillAndCommit(user)
    await user.click(screen.getByRole('button', { name: '3' })) // score the item
    expect(screen.getByText(KEY_TEXT)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Retry/ }))
    expect(container.querySelector('.key')).toBeNull()
    expect(screen.queryByText(KEY_TEXT)).toBeNull()

    await fillAndCommit(user)
    expect(screen.getByText(KEY_TEXT)).toBeInTheDocument()
  })
})
