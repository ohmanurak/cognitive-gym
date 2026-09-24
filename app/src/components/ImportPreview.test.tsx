// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportPreview } from './ImportPreview'

const plan = { actions: { 'w1d1:A': 'add' as const }, added: 1, replaced: 0, kept: 2, itemsByBlock: {} }

describe('ImportPreview', () => {
  afterEach(cleanup)
  it('shows counts; Cancel and Confirm call their handlers only when clicked', async () => {
    const ok = vi.fn()
    const no = vi.fn()
    render(<ImportPreview plan={plan} onConfirm={ok} onCancel={no} />)
    expect(screen.getByText(/kept because the local one is newer/)).toBeInTheDocument()
    expect(ok).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(no).toHaveBeenCalledOnce()
    expect(ok).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(ok).toHaveBeenCalledOnce()
  })
})
