import { useUi } from '@/store/uiStore'
import HomeScreen from '@/screens/HomeScreen'
import PlayScreen from '@/screens/PlayScreen'
import DrillScreen from '@/screens/DrillScreen'
import SettingsScreen from '@/screens/SettingsScreen'
import SummaryScreen from '@/screens/SummaryScreen'

export default function App() {
  const screen = useUi((s) => s.screen)

  return (
    <div className="flex h-full w-full flex-col bg-felt text-white">
      {screen === 'home' && <HomeScreen />}
      {screen === 'play' && <PlayScreen />}
      {screen === 'drill' && <DrillScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'summary' && <SummaryScreen />}
    </div>
  )
}
