import { type AnchorHTMLAttributes, type ReactNode } from "react"
import { useNavigate, type To } from "react-router-dom"

export function Link({ to, children, className, ...rest }: { to: To; children: ReactNode; className?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useNavigate()
  return (
    <a
      href={typeof to === "string" ? to : "#"}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
