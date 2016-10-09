// Score formula =
//   10 * kills +
//   100 * data_points_left +
//   3 * data_points_left * max(0, total_enemy_life - 3 * shots_fired)

// Tests

function testAll () {
  test(Point.prototype.towards.bind(new Point({x: 0, y: 0})), [
    {args: [{x: 0, y: 0}], out: r => r.x === 0 && r.y === 0},
    {args: [{x: 1, y: 1}], out: r => r.x === 1 && r.y === 1},
    {args: [{x: 1, y: 1}, {x: -1, y: 1}], out: r => r.x === 0 && r.y === 2}
  ])
}

function test (fn, expectations) {
  expectations.forEach(({args, out}) => {
    const actual = fn(...args)
    if (!out(actual)) {
      throw new Error(`test failed: expected ${fn.name}(${args.join(', ')}) to equal ${out} but was ${actual}`)
    }
  })
}

function assertType (type, ...values) {
  values.forEach(value => {
    if (typeof value !== type) {
      throw new TypeError(`expected ${value} to be a ${type} but was ${typeof value}`)
    }
  })
}

function assertProps (props, ...values) {
  values.forEach(value => props.forEach(prop => {
    if (!value.hasOwnProperty(prop)) {
      throw new TypeError(`expected ${value} to have prop ${prop}`)
    }
  }))
}

// Parsing

function line (...keys) {
  return readline().split(' ').map(int).reduce(...toObject(...keys))
}

function lines (...keys) {
  const n = int(readline())
  return Array(n).fill(0).map(() => line(...keys))
}

function int (valueStr) {
  return parseInt(valueStr)
}

function toObject (...keys) {
  return [(acc, item, index) => Object.assign(acc, {[keys[index]]: item}), {}]
}

// Lang

function create (constructor, objects, ...args) {
  if (!Array.isArray(objects)) return new constructor(objects)
  else return objects.map(obj => new constructor(obj, ...args))
}

function tap (value, fn) {
  fn(value)
  return value
}

function memoize (fn) {
  const cache = new Map()
  return x => cache.get(x) || tap(fn(x), r => cache.set(r))
}

// Collections

function minBy (selector) {
  selector = memoize(selector)
  return (currentMinItem, item) => {
    return selector(item) < selector(currentMinItem) ?
            item : currentMinItem
  }
}

function ids (entities) {
  return entities.map(prop('id')).join(', ') || 'none'
}

// Iteratees

function throughConstructor (constructor) {
  return x => new constructor(x)
}

function prop (propName) {
  return obj => obj[propName]
}

// Basic math

const Op = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mult: (a, b) => a * b
}

// Geometry

const Point = (function () {
  const lift = fn => (...args) => new Point({
    x: fn(...args.map(prop('x'))),
    y: fn(...args.map(prop('y')))
  })
  const [add, sub, mult, min, max, floor] = [Op.add, Op.sub, Op.mult, Math.min, Math.max, Math.floor].map(lift)
  const hypot = ({x, y}) => Math.hypot(x, y)
  return class Point {
    constructor (entity) {
      assertProps(['x', 'y'], entity)
      Object.assign(this, entity)
    }
    distanceTo (other) {
      return hypot(this.towards(other))
    }
    towards (...others) {
      return others.map(other => sub(other, this)).reduce(add)
    }
    flip () {
      return mult(this, {x: -1, y: -1})
    }
    relativeTo (other) {
      return add(this, other)
    }
    clamp (topLeft, bottomRight) {
      return min(max(this, topLeft), bottomRight)
    }
    truncateTo (length) {
      const ratio = Math.min(length / hypot(this), 1)
      return floor(mult(this, {x: ratio, y: ratio}))
    }
    toString () {
      return `${this.x} ${this.y}`
    }
    }
}())

// Game commands

function move (point) {
  print('MOVE', point.x, point.y)
}

function shoot (enemy) {
  print('SHOOT', enemy.id)
}

// Game logic

const origin = {x: 0, y: 0}
const arena = {x: 16000, y: 9000}

class Enemy extends Point {
  constructor (entity, dataPoints) {
    super(entity)
    this.attackRange = 2000
    this.speed = 500
    this.objective = dataPoints.reduce(minBy(dataPoint => this.distanceTo(dataPoint)))
    this.turnsBeforeCapture = Math.ceil(this.distanceTo(this.objective) / this.speed)
        // printErr(this.id, this.turnsBeforeCapture)
    this.nextPosition = this.towards(this.objective).truncateTo(this.speed).relativeTo(this)
  }
  nearlyInRangeOf (target) {
    return this.nextPosition.distanceTo(target) <= this.attackRange
  }
  atPointBlankOf (hunter) {
    const hunterNextPosition = hunter.towards(this).truncateTo(hunter.speed).relativeTo(hunter)
    const hunterNextNextPosition = hunterNextPosition.towards(this.nextPosition).truncateTo(hunter.speed).relativeTo(hunterNextPosition)
        // printErr(this.id, this.nearlyInRangeOf(hunter), this.nearlyInRangeOf(hunterNextPosition), this.nearlyInRangeOf(hunterNextNextPosition))
    return !this.nearlyInRangeOf(hunter) && /*! this.nearlyInRangeOf(hunterNextPosition) && */this.nearlyInRangeOf(hunterNextNextPosition)
        // return this.distanceTo(hunter) <= this.attackRange + this.speed * 2 + hunter.speed
  }
}

class Wolff extends Point {
  constructor (entity) {
    super(entity)
    this.speed = 1000
  }
  safetyFrom (enemies) {
    let destination = this
    let lethalEnemies = enemies.filter(enemy => enemy.nearlyInRangeOf(destination))
    const enemiesToEscapeFrom = lethalEnemies
    while (lethalEnemies.length > 0) {
      printErr('those are dangerous:', ids(enemiesToEscapeFrom))
      destination = this
                .towards(...enemiesToEscapeFrom)
                .flip()
                .truncateTo(this.speed)
                .relativeTo(this)
                .clamp(origin, arena)
      printErr("so I'll move to", destination)
      lethalEnemies = enemies.filter(enemy => enemy.nearlyInRangeOf(destination))
      printErr("but I'll run into:", ids(lethalEnemies))
      enemiesToEscapeFrom.push(...lethalEnemies)
    }
    return destination
  }
  planAttack (enemy, enemies) {
        // printErr(JSON.stringify(enemy))
    const turnsAvailable = enemy.turnsBeforeCapture

    const distanceThisTurn = this.distanceTo(enemy)
    const shotsRequiredToKillAtThisTurn = this.damageDealt(distanceThisTurn)

    const nextPositionIfMove = this.nextPositionTowards(enemy)
    const distanceNextTurn = nextPositionIfMove.distanceTo(enemy.nextPosition)
    const shotsRequiredToKillAtNextTurn = this.damageDealt(distanceNextTurn)

    if (shotsRequiredToKillAtNextTurn >= turnsAvailable) return () => shoot(enemy)
        // if (shotsRequiredToKillAtNextTurn < turnsAvailable) return () => move(this.towards(enemy).relativeTo(this))
        // else return () => shoot(enemy)

    const lethalEnemies = enemies.filter(enemy => enemy.nearlyInRangeOf(nextPositionIfMove))
    if (lethalEnemies.length > 0) return () => shoot(enemy)

    return () => move(this.towards(enemy).relativeTo(this))

        /* const turnsToKillWithOnlyShots = Math.ceil(enemy.life / this.damageDealt(enemy))
        if (turnsToKillWithOnlyShots < turnsAvailable) return () => shoot(enemy)
        else return () => move(this.towards(enemy).relativeTo(me)) */
  }
  damageDealt (distance) {
    return 125000 / Math.pow(distance, 1.2)
  }
  nextPositionTowards (position) {
    return this.towards(position).truncateTo(this.speed).relativeTo(this)
  }
}

testAll()

// game loop
while (true) {
  const me = create(Wolff, line('x', 'y'))
  const dataPoints = create(Point, lines('id', 'x', 'y'))
  const enemies = create(Enemy, lines('id', 'x', 'y', 'life'), dataPoints)
  const lethalEnemies = enemies.filter(enemy => enemy.nearlyInRangeOf(me))
    // printErr("lethal:", ids(lethalEnemies))
  const vulnerableEnemies = enemies.filter(enemy => enemy.atPointBlankOf(me))
    // printErr("vulnerable", ids(vulnerableEnemies))
  if (lethalEnemies.length > 0) {
    printErr('safety')
    move(me.safetyFrom(enemies))
  } else if (vulnerableEnemies.length > 0) {
    printErr('shoot point blank')
    const target = vulnerableEnemies.reduce(minBy(enemy => me.distanceTo(enemy)))
    shoot(target)
  } else {
        // printErr("run to closest")
        // const target = enemies.reduce(minBy(enemy => me.distanceTo(enemy)))
    const target = enemies.reduce(minBy(enemy => enemy.turnsBeforeCapture))
        // move(target)
    printErr('plan attack')
    me.planAttack(target, enemies)()
  }
}
