import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [habits, setHabits] = useState(() => {
    const saved = localStorage.getItem('habits')
    return saved ? JSON.parse(saved) : []
  })
  const [newHabit, setNewHabit] = useState('')

  useEffect(() => {
    localStorage.setItem('habits', JSON.stringify(habits))
  }, [habits])

  const getTodayString = () => {
    return new Date().toISOString().split('T')[0]
  }

  const calculateStreak = (completedDates) => {
    if (!completedDates || completedDates.length === 0) return 0

    const sorted = [...completedDates].sort().reverse()
    const today = getTodayString()
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

    if (sorted[0] !== today && sorted[0] !== yesterday) return 0

    let streak = 1
    for (let i = 1; i < sorted.length; i++) {
      const current = new Date(sorted[i - 1])
      const prev = new Date(sorted[i])
      const diffDays = Math.round((current - prev) / 86400000)

      if (diffDays === 1) {
        streak++
      } else {
        break
      }
    }
    return streak
  }

  const addHabit = (e) => {
    e.preventDefault()
    if (!newHabit.trim()) return

    const habit = {
      id: Date.now(),
      name: newHabit.trim(),
      completedDates: []
    }
    setHabits([...habits, habit])
    setNewHabit('')
  }

  const toggleComplete = (id) => {
    const today = getTodayString()
    setHabits(habits.map(habit => {
      if (habit.id !== id) return habit

      const isCompleted = habit.completedDates.includes(today)
      return {
        ...habit,
        completedDates: isCompleted
          ? habit.completedDates.filter(d => d !== today)
          : [...habit.completedDates, today]
      }
    }))
  }

  const deleteHabit = (id) => {
    setHabits(habits.filter(habit => habit.id !== id))
  }

  const isCompletedToday = (habit) => {
    return habit.completedDates.includes(getTodayString())
  }

  return (
    <div className="app">
      <h1>Habit Tracker</h1>

      <form onSubmit={addHabit} className="add-form">
        <input
          type="text"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          placeholder="Enter a new habit..."
        />
        <button type="submit">Add Habit</button>
      </form>

      <div className="habits-list">
        {habits.length === 0 ? (
          <p className="empty-message">No habits yet. Add one above!</p>
        ) : (
          habits.map(habit => (
            <div key={habit.id} className={`habit-item ${isCompletedToday(habit) ? 'completed' : ''}`}>
              <div className="habit-info">
                <span className="habit-name">{habit.name}</span>
                <span className="streak">🔥 {calculateStreak(habit.completedDates)} day streak</span>
              </div>
              <div className="habit-actions">
                <button
                  onClick={() => toggleComplete(habit.id)}
                  className={`complete-btn ${isCompletedToday(habit) ? 'done' : ''}`}
                >
                  {isCompletedToday(habit) ? '✓ Done' : 'Mark Done'}
                </button>
                <button onClick={() => deleteHabit(habit.id)} className="delete-btn">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default App
