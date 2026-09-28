import { Link } from 'react-router'

export function HomePage() {
  return (
    <>
      <h1>project-W</h1>
      <p>Split bills and keep track of your finances, all in your browser.</p>
      <p>
        Type in a bill's items, say who had what, and see who owes what, down to
        the cent. Everything stays on this device.
      </p>
      <p>
        <Link to="/split">Split a bill</Link>
      </p>
    </>
  )
}
