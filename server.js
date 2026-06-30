const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = '127.0.0.1';
const basePath = normalizeBasePath(process.env.BASE_PATH || '/');
const distPath = path.join(__dirname, 'dist', 'hydra', 'browser');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const defaultWorkouts = [
  {
    title: 'Hydra Wake-Up Flow',
    duration: 12,
    focus: 'Mobility + steps',
    description:
      'Start with marching, arm swings, and low-impact squats to wake up your body without spiking fatigue.'
  },
  {
    title: 'Sweat Without Sprinting',
    duration: 18,
    focus: 'Low-impact cardio',
    description:
      'Alternate brisk step jacks, knee drives, and fast walks in place for steady calorie burn.'
  },
  {
    title: 'Core and Posture Reset',
    duration: 14,
    focus: 'Core stability',
    description:
      'Use standing core work, planks on a bench, and controlled breathing to support better posture and balance.'
  }
];

const defaultTips = [
  {
    title: 'Build around protein first',
    detail:
      'Start meals with eggs, beans, fish, yogurt, or chicken so you stay full longer and snack less later.'
  },
  {
    title: 'Drink before you decide',
    detail:
      'A glass of water and a 10-minute pause can reduce stress eating and help you notice true hunger.'
  },
  {
    title: 'Keep the deficit gentle',
    detail:
      'A moderate calorie deficit is easier to sustain, which matters more than extreme restriction.'
  }
];

app.use(express.json());

app.get(joinBasePath('/api/content'), async (_request, response) => {
  try {
    const workouts = await pool.query(
      'SELECT title, duration_minutes, focus, description FROM workouts ORDER BY sort_order ASC'
    );
    const tips = await pool.query('SELECT title, detail FROM weight_loss_tips ORDER BY sort_order ASC');
    const signupCount = await pool.query('SELECT COUNT(*)::int AS count FROM signups');

    response.json({
      workouts: workouts.rows,
      tips: tips.rows,
      signupCount: signupCount.rows[0].count
    });
  } catch (error) {
    console.error('Failed to load content', error);
    response.status(500).json({ message: 'Unable to load Hydra content.' });
  }
});

app.post(joinBasePath('/api/signups'), async (request, response) => {
  const { name, email, goal } = request.body ?? {};

  if (!name || !email || !goal) {
    response.status(400).json({ message: 'Name, email, and goal are required.' });
    return;
  }

  try {
    await pool.query(
      'INSERT INTO signups (name, email, goal) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, goal = EXCLUDED.goal, updated_at = NOW()',
      [name, email, goal]
    );
    response.json({ message: 'Your Hydra plan has been saved.' });
  } catch (error) {
    console.error('Failed to save signup', error);
    response.status(500).json({ message: 'Unable to save your Hydra plan.' });
  }
});

app.use(basePath, express.static(distPath));

app.use(basePath, (_request, response) => {
  response.sendFile(path.join(distPath, 'index.html'));
});

start().catch((error) => {
  console.error('Hydra failed to start', error);
  process.exit(1);
});

async function start() {
  await initializeDatabase();
  app.listen(port, host, () => {
    console.log(`Hydra listening on http://${host}:${port}${basePath}`);
  });
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      focus TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS weight_loss_tips (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signups (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      goal TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const workoutCount = await pool.query('SELECT COUNT(*)::int AS count FROM workouts');
  if (workoutCount.rows[0].count === 0) {
    for (const [index, workout] of defaultWorkouts.entries()) {
      await pool.query(
        'INSERT INTO workouts (title, duration_minutes, focus, description, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [workout.title, workout.duration, workout.focus, workout.description, index]
      );
    }
  }

  const tipCount = await pool.query('SELECT COUNT(*)::int AS count FROM weight_loss_tips');
  if (tipCount.rows[0].count === 0) {
    for (const [index, tip] of defaultTips.entries()) {
      await pool.query(
        'INSERT INTO weight_loss_tips (title, detail, sort_order) VALUES ($1, $2, $3)',
        [tip.title, tip.detail, index]
      );
    }
  }
}

function normalizeBasePath(input) {
  if (!input || input === '/') {
    return '/';
  }

  const withLeadingSlash = input.startsWith('/') ? input : `/${input}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function joinBasePath(route) {
  if (basePath === '/') {
    return route;
  }

  return `${basePath}${route}`;
}
