/**
 * Content used to generate the SEO landing pages (see build-seo.js).
 * Edit freely: more unique, useful text per sport/city = better rankings.
 */

// `id` matches the sport ids used by app.js / api/places.js.
const SPORTS = [
  {
    id: 'badminton', slug: 'badminton-courts', name: 'Badminton', plural: 'badminton courts', singular: 'badminton court',
    tagline: 'Smash it. Badminton courts near you.',
    nearMe: 'Badminton court near me',
    intro: [
      'Looking for a badminton court near you? Cridaa lists indoor badminton courts and sports halls around your location, with photos, Google ratings, opening timings and distance so you can pick the right one in a minute.',
      'Whether you play a casual doubles game after work or train every morning, compare nearby courts, check what other players say in their reviews, and call the venue directly from the listing.',
    ],
    checklist: ['Wooden or synthetic (PU) flooring: a good surface is easier on your knees', 'Court lighting and ceiling height, especially for clears and lobs', 'Number of courts, so you are not waiting for your slot', 'Parking and changing rooms near the venue', 'Whether the venue rents rackets and shuttles'],
    faqs: [
      ['How do I find a badminton court near me?', 'Allow location access on Cridaa (or type your area) and choose the Badminton filter. Courts are listed nearest first with ratings, photos and timings.'],
      ['Can I check badminton court timings before going?', 'Yes. Each listing shows today\'s opening hours from Google, and the full weekly timings are in the venue details.'],
      ['How do I contact a badminton court?', 'Tap Call Now on the venue, fill in a short form, and your phone\'s dialer opens with the venue\'s number.'],
    ],
  },
  {
    id: 'box-cricket', slug: 'box-cricket-turfs', name: 'Box Cricket', plural: 'box cricket turfs', singular: 'box cricket turf',
    tagline: 'Your next match is minutes away. Box cricket turfs near you.',
    nearMe: 'Box cricket turf near me',
    intro: [
      'Box cricket is the quickest way to get a game going: a netted turf, a small squad and an hour of full-on cricket. Cridaa lists box cricket turfs near you with photos, ratings, timings and distance.',
      'Compare nearby turfs, read what other players say about the pitch and nets, and call the venue straight from the listing to sort your slot.',
    ],
    checklist: ['Turf quality: artificial grass condition and pitch evenness', 'Net height and condition, so shots and fielding stay safe', 'Floodlights if you plan to play in the evening', 'Team size the turf is built for (6-a-side, 8-a-side and so on)', 'Parking, seating and drinking water for the team'],
    faqs: [
      ['Where can I play box cricket near me?', 'Open Cridaa, allow location access or enter your area, and pick the Box Cricket filter. You get a list of nearby turfs sorted by distance.'],
      ['How do I choose a good box cricket turf?', 'Compare Google ratings and the number of reviews, look at the photos, and read recent reviews for comments on the pitch, nets and lighting.'],
      ['Can I see the turf price?', 'Pricing is coming soon on Cridaa. For now, call the venue from its listing to ask about slots and rates.'],
    ],
  },
  {
    id: 'football', slug: 'football-turfs', name: 'Football', plural: 'football turfs', singular: 'football turf',
    tagline: 'Football turfs near you for 5-a-side, 7-a-side and weekend games.',
    nearMe: 'Football turf near me',
    intro: [
      'Find football turfs near you in a couple of taps. Cridaa lists artificial turf grounds and futsal-style pitches around your location with photos, ratings, opening timings and distance.',
      'Browse nearby grounds, check reviews from other players, and call the venue directly to ask about slots for your team.',
    ],
    checklist: ['Pitch size and format: 5-a-side, 7-a-side or 11-a-side', 'Turf condition: even surface and good drainage', 'Floodlights for evening kick-offs', 'Goal posts, boundary nets and spare balls', 'Changing rooms, parking and nearby refreshments'],
    faqs: [
      ['How do I find a football turf near me?', 'Allow location access on Cridaa and choose the Football filter. Turfs appear nearest first, with ratings and photos.'],
      ['Which football turf is best?', 'Sort by Highest rated or Most reviewed, then open a few listings to compare photos, timings and what players say in reviews.'],
      ['Do football turfs list their timings?', 'Most do on Google. Cridaa shows today\'s timings on each card and the full week in the venue details.'],
    ],
  },
  {
    id: 'pickleball', slug: 'pickleball-courts', name: 'Pickleball', plural: 'pickleball courts', singular: 'pickleball court',
    tagline: 'Pick up a paddle. Pickleball courts near you.',
    nearMe: 'Pickleball court near me',
    intro: [
      'New to pickleball or already hooked? Cridaa helps you find pickleball courts near you, with photos, Google ratings, timings and distance in one list.',
      'Check nearby courts, read what other players say about the surface and facilities, and call the venue directly from the listing.',
    ],
    checklist: ['Dedicated pickleball lines versus shared tennis or badminton courts', 'Surface type and how much grip it gives', 'Indoor or outdoor, and whether there is shade or lighting', 'Whether paddles and balls can be rented', 'Beginner sessions or coaching on offer'],
    faqs: [
      ['Where can I play pickleball near me?', 'Open Cridaa, allow location access or enter your area, and choose the Pickleball filter to see nearby courts.'],
      ['Do I need my own paddle?', 'Many venues rent equipment, but it varies. Call the venue from its listing to ask.'],
      ['How do I contact a pickleball court?', 'Tap Call Now on the listing, fill in the short form, and your phone opens the dialer with the venue\'s number.'],
    ],
  },
  {
    id: 'tennis', slug: 'tennis-courts', name: 'Tennis', plural: 'tennis courts', singular: 'tennis court',
    tagline: 'Serve up your next set. Tennis courts near you.',
    nearMe: 'Tennis court near me',
    intro: [
      'Find tennis courts near you with Cridaa: clay, hard and synthetic courts around your location, with photos, ratings, opening timings and distance.',
      'Compare nearby courts, see what other players say in their reviews, and call the venue directly to ask about availability.',
    ],
    checklist: ['Court surface: hard, clay or synthetic', 'Floodlights for early-morning and evening play', 'Number of courts and how slots are managed', 'Ball machines, ball hire or coaching if you need them', 'Parking, seating and changing rooms'],
    faqs: [
      ['How do I find a tennis court near me?', 'Allow location access on Cridaa and choose the Tennis filter. Courts show nearest first with ratings, photos and timings.'],
      ['Can I see tennis court opening hours?', 'Yes. Today\'s hours appear on each card and the full weekly schedule is in the venue details, based on Google\'s data.'],
      ['Are all listed courts open to the public?', 'Some venues are clubs with their own rules. Call the venue from its listing to confirm before you go.'],
    ],
  },
];

// Coordinates match app.js. `areas` are well-known localities used in the page copy.
const CITIES = [
  { slug: 'ahmedabad', name: 'Ahmedabad', lat: 23.0225, lng: 72.5714, areas: ['Bodakdev', 'Satellite', 'Prahlad Nagar', 'Navrangpura', 'Maninagar'] },
  { slug: 'mumbai', name: 'Mumbai', lat: 19.076, lng: 72.8777, areas: ['Andheri', 'Bandra', 'Powai', 'Borivali', 'Malad'] },
  { slug: 'delhi', name: 'Delhi', lat: 28.6139, lng: 77.209, areas: ['Dwarka', 'Rohini', 'Saket', 'Vasant Kunj', 'Lajpat Nagar'] },
  { slug: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lng: 77.5946, areas: ['Indiranagar', 'Koramangala', 'HSR Layout', 'Whitefield', 'Jayanagar'] },
  { slug: 'hyderabad', name: 'Hyderabad', lat: 17.385, lng: 78.4867, areas: ['Gachibowli', 'Madhapur', 'Kondapur', 'Banjara Hills', 'Kukatpally'] },
  { slug: 'pune', name: 'Pune', lat: 18.5204, lng: 73.8567, areas: ['Baner', 'Kothrud', 'Viman Nagar', 'Hinjewadi', 'Wakad'] },
  { slug: 'chennai', name: 'Chennai', lat: 13.0827, lng: 80.2707, areas: ['Adyar', 'Velachery', 'Anna Nagar', 'T. Nagar', 'OMR'] },
  { slug: 'kolkata', name: 'Kolkata', lat: 22.5726, lng: 88.3639, areas: ['Salt Lake', 'New Town', 'Behala', 'Garia', 'Dum Dum'] },
  { slug: 'jaipur', name: 'Jaipur', lat: 26.9124, lng: 75.7873, areas: ['Vaishali Nagar', 'Malviya Nagar', 'Mansarovar', 'C-Scheme', 'Jagatpura'] },
  { slug: 'gurugram', name: 'Gurugram', lat: 28.4595, lng: 77.0266, areas: ['Golf Course Road', 'Sohna Road', 'Sector 56', 'Udyog Vihar', 'MG Road'] },
];

// Rotating hero phrases (home page).
const HERO_PHRASES = ['Badminton court', 'Box cricket turf', 'Football turf', 'Pickleball court', 'Tennis court', 'Sports venue'];

module.exports = { SPORTS, CITIES, HERO_PHRASES };
