import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { Hud } from './screens/Hud'

const isHud = window.location.hash.startsWith('#/hud')
if (isHud) document.body.classList.add('hud')

createRoot(document.getElementById('root')!).render(<StrictMode>{isHud ? <Hud /> : <App />}</StrictMode>)
