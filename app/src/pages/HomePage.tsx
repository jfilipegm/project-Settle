import { Link } from 'react-router'
import styles from './HomePage.module.css'

export function HomePage() {
  return (
    <>
      <h1>Settle</h1>
      <p className={styles.tagline}>Split bills. Settle up. Stay private.</p>
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
