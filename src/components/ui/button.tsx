import { forwardRef, type ButtonHTMLAttributes } from 'react'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'secondary' | 'ghost' | 'danger'; size?: 'default' | 'icon' }>(function Button({ className = '', variant = 'default', size = 'default', ...props }, ref) {
  return <button ref={ref} className={`ui-button ${variant} ${size} ${className}`} {...props} />
})
