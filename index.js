const express = require('express');
const { DateTime, Duration } = require('luxon');
const Table = require('cli-table');

const app = express();
const port = 3000;

// Constants for Event Scheduling
const NUMB_OF_ELITE_EVENTS = 2;
const MUTATION_RATE = 0.2;
const TOURNAMENT_SELECTION_SIZE_EVENTS = 5;
const EVENT_DURATION = 1; // in hours

// Example: Set start and end times
let EVENT_START_TIME;
let EVENT_END_TIME;

const TIME_SLOT_INTERVAL = Duration.fromObject({ hours: 1 });
const POPULATION_SIZE = 20;
const MAX_GENERATIONS = 200;

// Event class represents an event with an ID, name, assigned room, and time slot
class Event {
  constructor(id, name) {
    this._id = id;
    this._name = name;
    this._room = null;
    this._time_slot = null;
  }

  get id() {
    return this._id;
  }

  get name() {
    return this._name;
  }

  get room() {
    return this._room;
  }

  get timeSlot() {
    return this._time_slot;
  }

  set room(room) {
    this._room = room;
  }

  set timeSlot(timeSlot) {
    this._time_slot = timeSlot;
  }

  toString() {
    return `${this._name}, Room: ${this._room.number}, Time: ${this._time_slot ? this._time_slot.toFormat('hh:mm a') : 'N/A'}`;
  }
}

// Room class represents a room with a number and availability schedule
class Room {
  constructor(number, availabilitySchedule) {
    this._number = number;
    this._availabilitySchedule = availabilitySchedule;
  }

  get number() {
    return this._number;
  }

  isAvailable(timeSlot) {
    const index = Math.floor(timeSlot.diff(EVENT_START_TIME, 'hours').hours);
    return this._availabilitySchedule[index];
  }
}

// Data class contains predefined rooms and event names
class Data {
  constructor(initialAvailableRooms = 3, eventNames = [], startTime, endTime) {
    this._rooms = [];
    this._events = [];

    EVENT_START_TIME = DateTime.fromFormat(startTime, 'hh:mm a');
    EVENT_END_TIME = DateTime.fromFormat(endTime, 'hh:mm a');

    // Calculate the total number of time slots
    const totalTimeSlots = Math.floor(EVENT_END_TIME.diff(EVENT_START_TIME, 'hours').hours);

    for (let i = 0; i < initialAvailableRooms; i++) {
      const roomName = `Room ${i + 1}`;

      // Initialize availability schedule with all True (available)
      const availabilitySchedule = Array(totalTimeSlots).fill(true);

      // Mark some rooms as unavailable based on the initialAvailableRooms
      for (let j = 0; j < i; j++) {
        availabilitySchedule[j] = false;
      }

      this._rooms.push(new Room(roomName, availabilitySchedule));
    }

    this.EVENT_NAMES = eventNames.length > 0
      ? eventNames
      : ['Speed Programming', 'Speed Wiring', 'Cyber Quiz', 'SDP Evaluation', 'Poster Designing',
        'Website Designing', 'Database Designing', 'Algorithm Design'];

    this.EVENT_NAMES.forEach((eventName, index) => {
      this._events.push(new Event(index, eventName));
    });
  }

  get rooms() {
    return this._rooms;
  }

  get events() {
    return this._events;
  }
}

// ScheduleEvents class represents a schedule of events
class ScheduleEvents {
  constructor(data) {
    this._data = data;
    this._events = [];
    this._numOfConflicts = 0;
    this._fitness = -1;
    this._eventNum = 0;
    this._isFitnessChanged = true;
  }

  get events() {
    this._isFitnessChanged = true;
    return this._events;
  }

  get numOfConflicts() {
    return this._numOfConflicts;
  }

  get fitness() {
    if (this._isFitnessChanged) {
      this._fitness = this.calculateFitness();
      this._isFitnessChanged = false;
    }

    return this._fitness;
  }

  initialize() {
    for (let i = 0; i < this._data.events.length; i++) {
      const newEvent = new Event(this._eventNum, this._data.events[i].name);
      this._eventNum += 1;
      newEvent.timeSlot = this.getRandomTimeSlot();
      newEvent.room = this.getAvailableRoom(newEvent.timeSlot);
      this._events.push(newEvent);
    }

    return this;
  }

  calculateFitness() {
    this._numOfConflicts = 0;
    const events = this.events;

    for (let i = 0; i < events.length; i++) {
      if (!events[i].room.isAvailable(events[i].timeSlot)) {
        this._numOfConflicts += 1;
      }

      for (let j = 0; j < events.length; j++) {
        if (j >= i) {
          if (events[i].timeSlot.equals(events[j].timeSlot) && events[i].id !== events[j].id) {
            if (events[i].room === events[j].room) {
              this._numOfConflicts += 1;
            }
          }
        }
      }
    }

    return 1 / (1.0 * (this._numOfConflicts + 1));
  }

  getRandomTimeSlot() {
    let currentTime = EVENT_START_TIME;
    const availableTimeSlots = [];

    while (currentTime < EVENT_END_TIME) {
      availableTimeSlots.push(currentTime);
      currentTime = currentTime.plus(TIME_SLOT_INTERVAL);
    }

    const chosenTimeSlot = availableTimeSlots[Math.floor(Math.random() * availableTimeSlots.length)];
    return chosenTimeSlot;
  }

  getAvailableRoom(timeSlot) {
    const availableRooms = this._data.rooms.filter(room => room.isAvailable(timeSlot));

    if (!availableRooms.length) {
      // Handle the case where no available rooms are found for the given time slot
      throw new Error('No available rooms for the given time slot');
    }

    return availableRooms[Math.floor(Math.random() * availableRooms.length)];
  }

  toString() {
    let returnValue = '';
    for (let i = 0; i < this._events.length - 1; i++) {
      returnValue += this._events[i] + ', ';
    }

    returnValue += this._events[this._events.length - 1];

    return returnValue;
  }
}

// PopulationEvents class represents a population of schedules
class PopulationEvents {
  constructor(size, data) {
    this._size = size;
    this._data = data;
    this._schedules = Array.from({ length: size }, () => new ScheduleEvents(data).initialize());
  }

  get schedules() {
    return this._schedules;
  }
}

// GeneticAlgorithmEvents class represents the genetic algorithm for evolving schedules
class GeneticAlgorithmEvents {
  evolve(population) {
    return this._mutatePopulation(this._crossoverPopulation(population));
  }

  _crossoverPopulation(pop) {
    const crossoverPop = new PopulationEvents(0, pop._data);
    for (let i = 0; i < NUMB_OF_ELITE_EVENTS; i++) {
      crossoverPop.schedules.push(pop.schedules[i]);
    }

    let i = NUMB_OF_ELITE_EVENTS;

    while (i < POPULATION_SIZE) {
      const schedule1 = this._selectTournamentPopulation(pop).schedules[0];
      const schedule2 = this._selectTournamentPopulation(pop).schedules[0];
      crossoverPop.schedules.push(this._crossoverSchedule(schedule1, schedule2));

      i += 1;
    }

    return crossoverPop;
  }

  _mutatePopulation(population) {
    for (let i = NUMB_OF_ELITE_EVENTS; i < POPULATION_SIZE; i++) {
      this._mutateSchedule(population.schedules[i]);
    }

    return population;
  }

  _crossoverSchedule(schedule1, schedule2) {
    const crossoverSchedule = new ScheduleEvents(schedule1._data).initialize();
    for (let i = 0; i < crossoverSchedule.events.length; i++) {
      if (Math.random() > 0.5) {
        crossoverSchedule.events[i] = schedule1.events[i];
      } else {
        crossoverSchedule.events[i] = schedule2.events[i];
      }
    }

    return crossoverSchedule;
  }

  _mutateSchedule(mutateSchedule) {
    const schedule = new ScheduleEvents(mutateSchedule._data).initialize();
    for (let i = 0; i < mutateSchedule.events.length; i++) {
      if (MUTATION_RATE > Math.random()) {
        mutateSchedule.events[i] = schedule.events[i];
      }
    }
    return mutateSchedule;
  }

  _selectTournamentPopulation(pop) {
    const tournamentPop = new PopulationEvents(0, pop._data);
    let i = 0;
    while (i < TOURNAMENT_SELECTION_SIZE_EVENTS) {
      tournamentPop.schedules.push(pop.schedules[Math.floor(Math.random() * POPULATION_SIZE)]);
      i += 1;
    }

    tournamentPop.schedules.sort((a, b) => b.fitness - a.fitness);

    return tournamentPop;
  }
}

// DisplayMgrEvents class handles the display of available data, generations, and schedules
class DisplayMgrEvents {
  printAvailableData(data) {
    console.log('> All Available Data');
    this.printRooms(data);
    this.printEvents(data);
  }

  printRooms(data) {
    const rooms = data.rooms;
    const availableRoomsTable = new Table({ head: ['Room', 'Availability Schedule'] });

    for (let i = 0; i < rooms.length; i++) {
      const roomSchedule = rooms[i]._availabilitySchedule.map(slot => (slot ? 'Available' : 'Unavailable'));
      availableRoomsTable.push([rooms[i].number, roomSchedule]);
    }

    console.log(availableRoomsTable.toString());
  }

  printEvents(data) {
    const availableEventsTable = new Table({ head: ['Event #', 'Event Name'] });
    const events = data.events;

    for (let i = 0; i < events.length; i++) {
      availableEventsTable.push([events[i].id, events[i].name]);
    }

    console.log(availableEventsTable.toString());
  }

  printGeneration(population) {
    const table1 = new Table({ head: ['Schedule #', 'Fitness', '# of conflicts', 'Events'] });
    const schedules = population.schedules;

    for (let i = 0; i < schedules.length; i++) {
      table1.push([i + 1, schedules[i].fitness.toFixed(3), schedules[i].numOfConflicts, schedules[i].toString()]);
    }

    console.log(table1.toString());
  }

  printScheduleAsTable(schedule) {
    const table1 = new Table({ head: ['Event #', 'Event Name', 'Room', 'Time Slot'] });
    const events = schedule.events;

    for (let i = 0; i < events.length; i++) {
      table1.push([
        events[i].id,
        events[i].name,
        events[i].room ? events[i].room.number : 'N/A',
        events[i].timeSlot ? events[i].timeSlot.toFormat('hh:mm a') : 'N/A',
      ]);
    }

    console.log(table1.toString());
  }
}

// Endpoint to get the best schedule with dynamic input
app.get('/api/best-schedule/:numRooms/:eventNames/:startTime/:endTime', (req, res) => {
  const numRooms = parseInt(req.params.numRooms);
  const eventNames = req.params.eventNames.split(',');
  const startTime = req.params.startTime;
  const endTime = req.params.endTime;

  // Specify the number of initial available rooms and create Data object with dynamic input
  const data = new Data(numRooms, eventNames, startTime, endTime);

  let generationNumber = 0;
  let population = new PopulationEvents(POPULATION_SIZE, data);
  population.schedules.sort((a, b) => b.fitness - a.fitness);
  const geneticAlgorithm = new GeneticAlgorithmEvents();

  while (population.schedules[0].fitness !== 1.0 && generationNumber < MAX_GENERATIONS) {
    generationNumber += 1;
    population = geneticAlgorithm.evolve(population);
    population.schedules.sort((a, b) => b.fitness - a.fitness);
  }

  const bestSchedule = population.schedules[0];
  res.json({
    bestSchedule: {
      fitness: bestSchedule.fitness,
      schedule: bestSchedule.events.map(event => ({
        eventId: event.id,
        eventName: event.name,
        room: event.room ? event.room.number : 'N/A',
        timeSlot: event.timeSlot ? event.timeSlot.toFormat('hh:mm a') : 'N/A',
      })),
    },
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
