import type { Strain } from '../types';

// ============================================
// Local Strain Database
// ============================================

const LOCAL_STRAINS: Strain[] = [
  {
    id: '1',
    name: 'Blue Dream',
    type: 'hybrid',
    thc: '17-24%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Euphoric', 'Relaxed', 'Creative', 'Happy', 'Uplifted'],
    flavors: ['Berry', 'Blueberry', 'Sweet', 'Herbal'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Headaches'],
    description: 'Blue Dream is a sativa-dominant hybrid originating in California. It delivers a balanced full-body relaxation with gentle cerebral invigoration, making it a popular choice for both novice and veteran consumers.',
    growTips: ['Responds well to topping', 'THRIVES in warm climates', 'Watch for mold in humid conditions'],
  },
  {
    id: '2',
    name: 'OG Kush',
    type: 'hybrid',
    thc: '19-26%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Happy', 'Euphoric', 'Relaxed', 'Uplifted'],
    flavors: ['Earthy', 'Pine', 'Woody', 'Lemon'],
    medicalUses: ['Stress', 'Anxiety', 'Pain', 'Appetite Loss'],
    description: 'OG Kush is a legendary strain with a complex aroma of skunk, spice, and citrus. It delivers a potent mix of head and body effects, making it a staple in the West Coast cannabis scene.',
    growTips: ['Requires low humidity', 'Benefits from LST', 'Feed heavily during flowering'],
  },
  {
    id: '3',
    name: 'Sour Diesel',
    type: 'sativa',
    thc: '20-25%',
    cbd: '<1%',
    floweringTime: '10-11 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Energetic', 'Euphoric', 'Creative', 'Uplifted', 'Focused'],
    flavors: ['Diesel', 'Pungent', 'Citrus', 'Earthy'],
    medicalUses: ['Depression', 'Stress', 'Pain', 'Fatigue'],
    description: 'Sour Diesel, also known as Sour D, is a fast-acting strain that delivers energizing, dreamy cerebral effects. Its pungent, diesel-like aroma is unmistakable and has made it a favorite among sativa lovers.',
    growTips: ['Tall plant - needs vertical space', 'Strong odor - use carbon filter', 'Best with SCROG technique'],
  },
  {
    id: '4',
    name: 'Girl Scout Cookies',
    type: 'hybrid',
    thc: '25-28%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Euphoric', 'Happy', 'Relaxed', 'Creative', 'Uplifted'],
    flavors: ['Sweet', 'Mint', 'Cherry', 'Lemon'],
    medicalUses: ['Pain', 'Nausea', 'Appetite Loss', 'Stress'],
    description: 'Girl Scout Cookies (GSC) is an OG Kush and Durban Poison hybrid known for its sweet and earthy aroma. It delivers full-body relaxation with a powerful dose of euphoria, making it a multi-award winning strain.',
    growTips: ['Moderate feeder', 'Works well with SOG', 'Purple colors with cooler temps'],
  },
  {
    id: '5',
    name: 'Granddaddy Purple',
    type: 'indica',
    thc: '17-23%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Grape', 'Berry', 'Sweet', 'Earthy'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Appetite Loss'],
    description: 'Granddaddy Purple (GDP) is a famous indica cross of Purple Urkle and Big Bud. Its stunning purple buds deliver a potent combination of physical relaxation and cerebral euphoria.',
    growTips: ['Ideal for beginners', 'Colors develop in flowering', 'Moderate nutrient needs'],
  },
  {
    id: '6',
    name: 'Jack Herer',
    type: 'sativa',
    thc: '18-24%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Creative', 'Euphoric', 'Focused', 'Happy'],
    flavors: ['Pine', 'Woody', 'Spicy', 'Earthy'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'PTSD'],
    description: 'Jack Herer is a sativa-dominant strain named after the cannabis activist. It provides a blissful, clear-headed, and creative high that has won numerous awards and accolades.',
    growTips: ['Responds well to topping', 'Can handle higher temps', 'Multiple phenotypes possible'],
  },
  {
    id: '7',
    name: 'Northern Lights',
    type: 'indica',
    thc: '16-21%',
    cbd: '<1%',
    floweringTime: '7-8 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Pine', 'Sweet', 'Earthy', 'Woody'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Appetite Loss'],
    description: 'Northern Lights is one of the most famous indica strains of all time. Its resinous buds deliver a fast-acting, full-body relaxation that is perfect for unwinding after a long day.',
    growTips: ['Very beginner-friendly', 'Resistant to pests and mold', 'Compact plant structure'],
  },
  {
    id: '8',
    name: 'White Widow',
    type: 'hybrid',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Euphoric', 'Happy', 'Relaxed', 'Creative', 'Uplifted'],
    flavors: ['Earthy', 'Woody', 'Pine', 'Sweet'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Insomnia'],
    description: 'White Widow is a balanced hybrid first bred in the Netherlands. Famous for its white, crystal-covered buds, it delivers a powerful burst of euphoria and energy.',
    growTips: ['Easy to grow', 'Produces lots of resin', 'Good for extracts'],
  },
  {
    id: '9',
    name: 'AK-47',
    type: 'hybrid',
    thc: '19-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Happy', 'Relaxed', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Earthy', 'Skunk', 'Sweet', 'Woody'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Insomnia'],
    description: 'AK-47 is a sativa-dominant hybrid that delivers a long-lasting, steady cerebral buzz. Despite its aggressive name, it provides a mellow and relaxing experience.',
    growTips: ['Multiple harvests per year outdoors', 'Produces dense buds', 'Strong odor during flowering'],
  },
  {
    id: '10',
    name: 'Bubba Kush',
    type: 'indica',
    thc: '15-22%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Hungry', 'Euphoric'],
    flavors: ['Earthy', 'Sweet', 'Coffee', 'Woody'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Bubba Kush is a heavy indica strain known for its tranquilizing effects. Its sweet, earthy flavor and powerful sedative properties make it ideal for evening use.',
    growTips: ['Compact growth pattern', 'Ideal for small spaces', 'Needs support for heavy buds'],
  },
  {
    id: '11',
    name: 'Durban Poison',
    type: 'sativa',
    thc: '15-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Energetic', 'Focused', 'Creative', 'Euphoric', 'Uplifted'],
    flavors: ['Sweet', 'Pine', 'Earthy', 'Spicy'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'Nausea'],
    description: 'Durban Poison is a pure sativa originating from Durban, South Africa. Known for its sweet smell and energetic, uplifting effects, it is perfect for productivity and outdoor activities.',
    growTips: ['Tall plant - needs training', 'Resistant to mold', 'Fast flowering for a sativa'],
  },
  {
    id: '12',
    name: 'Gorilla Glue #4',
    type: 'hybrid',
    thc: '25-30%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Euphoric', 'Happy', 'Sleepy', 'Hungry'],
    flavors: ['Earthy', 'Pungent', 'Pine', 'Diesel'],
    medicalUses: ['Pain', 'Insomnia', 'Stress', 'Muscle Spasms'],
    description: 'Gorilla Glue #4 is a potent hybrid known for its extremely high THC content and sticky, resin-covered buds. It delivers a heavy-handed euphoria and relaxation.',
    growTips: ['Very sticky - great for extracts', 'Needs support for heavy buds', 'Moderate nutrient needs'],
  },
  {
    id: '13',
    name: 'Pineapple Express',
    type: 'hybrid',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Pineapple', 'Tropical', 'Sweet', 'Citrus'],
    medicalUses: ['Depression', 'Stress', 'Fatigue', 'Pain'],
    description: 'Pineapple Express is a sativa-dominant hybrid with a delicious tropical flavor. It provides long-lasting energetic effects perfect for creative pursuits and social activities.',
    growTips: ['Loves warm climates', 'Produces aromatic buds', 'Moderate feeding schedule'],
  },
  {
    id: '14',
    name: 'Purple Haze',
    type: 'sativa',
    thc: '16-20%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Euphoric', 'Creative', 'Happy', 'Uplifted', 'Energetic'],
    flavors: ['Berry', 'Sweet', 'Earthy', 'Grape'],
    medicalUses: ['Depression', 'Stress', 'Fatigue', 'Anxiety'],
    description: 'Purple Haze is a legendary sativa strain named after the Jimi Hendrix song. It delivers a dreamy, psychedelic cerebral high with a sweet, berry flavor.',
    growTips: ['Colors develop with cooler temps', 'Needs vertical space', 'Moderate difficulty'],
  },
  {
    id: '15',
    name: 'Wedding Cake',
    type: 'hybrid',
    thc: '22-28%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Sweet', 'Vanilla', 'Earthy', 'Pepper'],
    medicalUses: ['Pain', 'Insomnia', 'Stress', 'Appetite Loss'],
    description: 'Wedding Cake, also known as Pink Cookies, is a potent indica-dominant hybrid. Its rich tangy flavor profile with earthy pepper undertones delivers a relaxing and euphoric high.',
    growTips: ['Benefits from LST', 'Moderate to heavy feeder', 'Dense buds need airflow'],
  },
  {
    id: '16',
    name: 'Gelato',
    type: 'hybrid',
    thc: '20-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Happy', 'Relaxed', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Sweet', 'Berry', 'Citrus', 'Lavender'],
    medicalUses: ['Pain', 'Stress', 'Depression', 'Insomnia'],
    description: 'Gelato is a hybrid cross of Sunset Sherbet and Thin Mint Girl Scout Cookies. It delivers a powerful euphoric burst accompanied by full-body relaxation.',
    growTips: ['Produces colorful buds', 'Moderate nutrient needs', 'Best with controlled environment'],
  },
  {
    id: '17',
    name: 'Zkittlez',
    type: 'indica',
    thc: '15-23%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Sleepy', 'Focused'],
    flavors: ['Berry', 'Grape', 'Citrus', 'Sweet', 'Tropical'],
    medicalUses: ['Stress', 'Anxiety', 'Pain', 'Insomnia'],
    description: 'Zkittlez is an indica-dominant mix of Grape Ape and Grapefruit. It offers a tropical, berry flavor and a calming body high that won\'t leave you sedated.',
    growTips: ['Easy to grow', 'Colorful buds', 'Moderate feeding'],
  },
  {
    id: '18',
    name: 'Maui Wowie',
    type: 'sativa',
    thc: '13-19%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Energetic', 'Euphoric', 'Happy', 'Uplifted', 'Creative'],
    flavors: ['Tropical', 'Pineapple', 'Citrus', 'Sweet'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'PTSD'],
    description: 'Maui Wowie is a classic sativa from Hawaii known for its sweet tropical flavor and energetic, creative high. It captures the spirit of the islands in every puff.',
    growTips: ['Loves warm, sunny climates', 'Tall plant - needs training', 'Resistant to pests'],
  },
  {
    id: '19',
    name: 'Trainwreck',
    type: 'hybrid',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Euphoric', 'Happy', 'Creative', 'Uplifted', 'Energetic'],
    flavors: ['Pine', 'Sweet', 'Earthy', 'Lemon'],
    medicalUses: ['Pain', 'Stress', 'Depression', 'PTSD'],
    description: 'Trainwreck is a mind-bending sativa-dominant hybrid with potent sativa effects. It delivers a rush of euphoria and creativity that hits like a freight train.',
    growTips: ['Needs topping for height control', 'Fast vegetative growth', 'Moderate to heavy feeder'],
  },
  {
    id: '20',
    name: 'Afghan Kush',
    type: 'indica',
    thc: '17-22%',
    cbd: '1-2%',
    floweringTime: '7-8 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Hungry', 'Euphoric'],
    flavors: ['Earthy', 'Woody', 'Pine', 'Sweet'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Afghan Kush is a pure indica landrace strain from the Hindu Kush mountains. It delivers a deeply relaxing body high with a sweet, earthy flavor profile.',
    growTips: ['Very hardy and resilient', 'Short flowering time', 'Produces heavy resin'],
  },
  {
    id: '21',
    name: 'Super Silver Haze',
    type: 'sativa',
    thc: '18-23%',
    cbd: '<1%',
    floweringTime: '10-11 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Euphoric', 'Creative', 'Happy', 'Uplifted'],
    flavors: ['Citrus', 'Sweet', 'Earthy', 'Skunk'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'Pain'],
    description: 'Super Silver Haze is a legendary sativa that won three consecutive Cannabis Cups. It delivers an energetic, long-lasting cerebral high with a sweet, skunky aroma.',
    growTips: ['Tall plant - needs training', 'Long flowering period', 'Best with SCROG'],
  },
  {
    id: '22',
    name: 'Do-Si-Dos',
    type: 'indica',
    thc: '19-30%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Euphoric', 'Happy', 'Sleepy', 'Uplifted'],
    flavors: ['Sweet', 'Earthy', 'Lime', 'Floral'],
    medicalUses: ['Pain', 'Insomnia', 'Stress', 'Nausea'],
    description: 'Do-Si-Dos is a potent indica-dominant strain with a sweet, minty flavor. It delivers a powerful body buzz combined with cerebral euphoria.',
    growTips: ['Benefits from topping', 'Produces dense, frosty buds', 'Moderate feeding schedule'],
  },
  {
    id: '23',
    name: 'Tangie',
    type: 'sativa',
    thc: '19-22%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Tangerine', 'Citrus', 'Sweet', 'Orange'],
    medicalUses: ['Depression', 'Stress', 'Fatigue', 'Anxiety'],
    description: 'Tangie is a sativa-dominant strain with an unmistakable tangerine aroma. It provides an uplifting, creative high perfect for daytime use.',
    growTips: ['Very aromatic - use carbon filter', 'Tall plant - needs training', 'Loves organic nutrients'],
  },
  {
    id: '24',
    name: 'Runtz',
    type: 'hybrid',
    thc: '19-29%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Tropical', 'Sweet', 'Fruity', 'Berry'],
    medicalUses: ['Stress', 'Anxiety', 'Pain', 'Depression'],
    description: 'Runtz is a hybrid strain made by crossing Zkittlez with Gelato. It has a fruity, tropical flavor profile and delivers a long-lasting, balanced high.',
    growTips: ['Produces colorful buds', 'Moderate nutrient needs', 'Best with controlled environment'],
  },
  {
    id: '25',
    name: 'Purple Kush',
    type: 'indica',
    thc: '17-22%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Grape', 'Sweet', 'Earthy', 'Berry'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Purple Kush is a pure indica that sets itself apart with its eye-catching colors and potent effects. It delivers a blissful, long-lasting body high.',
    growTips: ['Colors develop in flowering', 'Compact plant structure', 'Ideal for small spaces'],
  },
  {
    id: '26',
    name: 'Amnesia Haze',
    type: 'sativa',
    thc: '20-25%',
    cbd: '<1%',
    floweringTime: '10-11 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Euphoric', 'Creative', 'Happy', 'Uplifted'],
    flavors: ['Citrus', 'Lemon', 'Earthy', 'Sweet'],
    medicalUses: ['Depression', 'Stress', 'Fatigue', 'Pain'],
    description: 'Amnesia Haze is a sativa-dominant strain with a complex genetic background. It delivers a potent, uplifting cerebral high with a citrusy flavor profile.',
    growTips: ['Long flowering period', 'Susceptible to bud rot', 'Best in controlled environments'],
  },
  {
    id: '27',
    name: 'Lemon Haze',
    type: 'sativa',
    thc: '17-22%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Lemon', 'Citrus', 'Sweet', 'Tangy'],
    medicalUses: ['Depression', 'Stress', 'Fatigue', 'Nausea'],
    description: 'Lemon Haze is a zesty sativa-dominant strain with a powerful lemon aroma. It provides an uplifting, energetic high perfect for daytime activities.',
    growTips: ['Very aromatic', 'Responds well to topping', 'Moderate feeding schedule'],
  },
  {
    id: '28',
    name: 'Strawberry Cough',
    type: 'sativa',
    thc: '17-22%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Strawberry', 'Sweet', 'Berry', 'Earthy'],
    medicalUses: ['Depression', 'Anxiety', 'Stress', 'PTSD'],
    description: 'Strawberry Cough is a sweet sativa known for its strawberry aroma and uplifting effects. It delivers a powerful cerebral high that can induce coughing.',
    growTips: ['Needs good airflow', 'Produces dense buds', 'Best with SCROG'],
  },
  {
    id: '29',
    name: 'Harlequin',
    type: 'hybrid',
    thc: '5-10%',
    cbd: '10-15%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Focused', 'Happy', 'Uplifted', 'Clear-headed'],
    flavors: ['Earthy', 'Woody', 'Sweet', 'Mango'],
    medicalUses: ['Pain', 'Anxiety', 'Inflammation', 'Seizures'],
    description: 'Harlequin is a CBD-rich strain with a high CBD to THC ratio. It provides clear-headed relief without intoxicating effects, making it ideal for medical users.',
    growTips: ['Easy to grow', 'Great for medical gardens', 'Consistent CBD production'],
  },
  {
    id: '30',
    name: 'Charlotte\'s Web',
    type: 'hemp',
    thc: '<0.3%',
    cbd: '12-18%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Focused', 'Clear-headed', 'Happy'],
    flavors: ['Earthy', 'Olive oil', 'Woody', 'Pine'],
    medicalUses: ['Epilepsy', 'Anxiety', 'Pain', 'Inflammation', 'PTSD'],
    description: 'Charlotte\'s Web is a high-CBD hemp strain famous for its use in treating pediatric epilepsy. It provides therapeutic benefits without psychoactive effects.',
    growTips: ['Very beginner-friendly', 'Legal hemp variety', 'Needs good soil drainage'],
  },
  {
    id: '31',
    name: 'Mimosa',
    type: 'hybrid',
    thc: '20-27%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Citrus', 'Orange', 'Tropical', 'Sweet'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'Nausea'],
    description: 'Mimosa is a sativa-dominant hybrid with a citrusy aroma. It delivers an energetic, uplifting high perfect for social gatherings and creative work.',
    growTips: ['Produces dense, frosty buds', 'Moderate to heavy feeder', 'Loves warm climates'],
  },
  {
    id: '32',
    name: 'Ice Cream Cake',
    type: 'indica',
    thc: '20-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Vanilla', 'Sweet', 'Creamy', 'Earthy'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Anxiety'],
    description: 'Ice Cream Cake is an indica-dominant hybrid with a sweet, creamy flavor. It delivers a powerful body high that melts away stress and tension.',
    growTips: ['Produces purple hues', 'Dense buds need airflow', 'Moderate feeding'],
  },
  {
    id: '33',
    name: 'MAC (Miracle Alien Cookies)',
    type: 'hybrid',
    thc: '20-25%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Euphoric', 'Happy', 'Relaxed', 'Creative', 'Uplifted'],
    flavors: ['Citrus', 'Sour', 'Earthy', 'Floral'],
    medicalUses: ['Pain', 'Stress', 'Depression', 'Appetite Loss'],
    description: 'MAC is a balanced hybrid known for its complex terpene profile and potent effects. It delivers a euphoric, creative high with a sour citrus flavor.',
    growTips: ['Benefits from LST', 'Multiple phenotypes possible', 'Moderate nutrient needs'],
  },
  {
    id: '34',
    name: 'Sunset Sherbet',
    type: 'hybrid',
    thc: '18-24%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Happy', 'Relaxed', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Sweet', 'Berry', 'Citrus', 'Tropical'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Appetite Loss'],
    description: 'Sunset Sherbet is an indica-leaning hybrid with a fruity, sweet flavor. It provides a relaxing body high with uplifting cerebral effects.',
    growTips: ['Easy to grow', 'Colorful buds', 'Good for beginners'],
  },
  {
    id: '35',
    name: 'Purple Punch',
    type: 'indica',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Grape', 'Blueberry', 'Sweet', 'Vanilla'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Nausea'],
    description: 'Purple Punch is a sweet-tasting indica with grape and blueberry notes. It delivers a powerful sedative effect perfect for evening relaxation.',
    growTips: ['Colors develop in flowering', 'Compact structure', 'Great for small spaces'],
  },
  {
    id: '36',
    name: 'Larry OG',
    type: 'hybrid',
    thc: '17-24%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Uplifted', 'Creative'],
    flavors: ['Earthy', 'Pine', 'Lemon', 'Sweet'],
    medicalUses: ['Pain', 'Stress', 'Depression', 'Appetite Loss'],
    description: 'Larry OG is a balanced hybrid with a classic OG aroma. It delivers a potent mix of cerebral and physical effects that build over time.',
    growTips: ['Benefits from topping', 'Strong odor during flowering', 'Moderate nutrient needs'],
  },
  {
    id: '37',
    name: 'Cereal Milk',
    type: 'hybrid',
    thc: '18-23%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Happy', 'Relaxed', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Sweet', 'Vanilla', 'Creamy', 'Berry'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Anxiety'],
    description: 'Cereal Milk is a hybrid strain with a sweet, creamy flavor reminiscent of leftover cereal milk. It provides a balanced, feel-good high.',
    growTips: ['Produces colorful buds', 'Moderate feeding', 'Best with controlled environment'],
  },
  {
    id: '38',
    name: 'Gas (Runtz x Gelato)',
    type: 'hybrid',
    thc: '22-28%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Euphoric', 'Happy', 'Sleepy', 'Hungry'],
    flavors: ['Diesel', 'Sweet', 'Pungent', 'Earthy'],
    medicalUses: ['Pain', 'Insomnia', 'Stress', 'Appetite Loss'],
    description: 'Gas is a potent hybrid known for its pungent, fuel-like aroma. It delivers heavy-hitting effects that start with euphoria and settle into deep relaxation.',
    growTips: ['Very sticky - great for extracts', 'Strong odor - use carbon filter', 'Needs support for heavy buds'],
  },
  {
    id: '39',
    name: 'Animal Mintz',
    type: 'hybrid',
    thc: '20-28%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Euphoric', 'Happy', 'Sleepy', 'Creative'],
    flavors: ['Mint', 'Sweet', 'Earthy', 'Vanilla'],
    medicalUses: ['Pain', 'Insomnia', 'Stress', 'Depression'],
    description: 'Animal Mintz is a potent hybrid with a minty, sweet flavor. It delivers a powerful cerebral rush followed by full-body relaxation.',
    growTips: ['Produces frosty buds', 'Benefits from LST', 'Moderate to heavy feeder'],
  },
  {
    id: '40',
    name: 'Black Cherry Punch',
    type: 'indica',
    thc: '18-24%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Cherry', 'Grape', 'Sweet', 'Berry'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Anxiety'],
    description: 'Black Cherry Punch is a sweet indica-dominant strain with cherry and grape flavors. It provides a deeply relaxing body high perfect for evening use.',
    growTips: ['Easy to grow', 'Colorful buds', 'Moderate nutrient needs'],
  },
  {
    id: '41',
    name: 'Green Crack',
    type: 'sativa',
    thc: '15-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Energetic', 'Focused', 'Euphoric', 'Happy', 'Uplifted'],
    flavors: ['Citrus', 'Mango', 'Sweet', 'Earthy'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'ADHD'],
    description: 'Green Crack is a potent sativa known for its energizing, invigorating effects. It provides a sharp mental buzz that keeps you productive and focused.',
    growTips: ['Very beginner-friendly', 'Fast vegetative growth', 'Resistant to pests'],
  },
  {
    id: '42',
    name: 'Banana Kush',
    type: 'hybrid',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Sleepy', 'Creative'],
    flavors: ['Banana', 'Tropical', 'Sweet', 'Earthy'],
    medicalUses: ['Stress', 'Depression', 'Pain', 'Insomnia'],
    description: 'Banana Kush is a sweet, tropical hybrid with a banana aroma. It delivers a euphoric, relaxing high that\'s perfect for unwinding after a long day.',
    growTips: ['Needs good airflow', 'Produces aromatic buds', 'Moderate feeding'],
  },
  {
    id: '43',
    name: 'Ghost Train Haze',
    type: 'sativa',
    thc: '25-28%',
    cbd: '<1%',
    floweringTime: '10-11 weeks',
    yield: 'High',
    difficulty: 'hard',
    effects: ['Energetic', 'Euphoric', 'Creative', 'Focused', 'Uplifted'],
    flavors: ['Citrus', 'Sweet', 'Earthy', 'Pine'],
    medicalUses: ['Depression', 'Fatigue', 'Pain', 'Appetite Loss'],
    description: 'Ghost Train Haze is an extremely potent sativa with sky-high THC levels. It delivers an intense cerebral experience that is not for the faint-hearted.',
    growTips: ['Very tall plant', 'Long flowering period', 'Best for experienced growers'],
  },
  {
    id: '44',
    name: 'Purple Urkle',
    type: 'indica',
    thc: '17-21%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Grape', 'Berry', 'Sweet', 'Earthy'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Purple Urkle is a classic indica known for its grape aroma and deeply relaxing effects. It delivers a sedative body high ideal for nighttime use.',
    growTips: ['Needs cooler temps for colors', 'Compact growth', 'Moderate nutrient needs'],
  },
  {
    id: '45',
    name: 'Sensi Star',
    type: 'indica',
    thc: '18-22%',
    cbd: '<1%',
    floweringTime: '7-8 weeks',
    yield: 'High',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Earthy', 'Pine', 'Sweet', 'Citrus'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Sensi Star is a powerful indica with a strong, earthy aroma. It delivers a heavy body stone that can help with pain and insomnia.',
    growTips: ['Very hardy', 'Short flowering time', 'Produces dense buds'],
  },
  {
    id: '46',
    name: 'Chocolope',
    type: 'sativa',
    thc: '18-23%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Happy', 'Euphoric', 'Creative', 'Uplifted'],
    flavors: ['Chocolate', 'Coffee', 'Sweet', 'Earthy'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'Pain'],
    description: 'Chocolope is a chocolate-flavored sativa with energizing effects. It provides a mental boost perfect for creative activities and social situations.',
    growTips: ['Tall plant - needs training', 'Produces large buds', 'Moderate feeding'],
  },
  {
    id: '47',
    name: 'Critical Mass',
    type: 'indica',
    thc: '18-22%',
    cbd: '1-2%',
    floweringTime: '7-8 weeks',
    yield: 'Very High',
    difficulty: 'easy',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Earthy', 'Sweet', 'Skunk', 'Woody'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Critical Mass is a heavy-yielding indica known for its massive buds. It delivers a relaxing body high with a classic skunky flavor.',
    growTips: ['Needs support for heavy buds', 'Fast flowering', 'Good for beginners'],
  },
  {
    id: '48',
    name: 'Super Lemon Haze',
    type: 'sativa',
    thc: '19-25%',
    cbd: '<1%',
    floweringTime: '9-10 weeks',
    yield: 'High',
    difficulty: 'moderate',
    effects: ['Energetic', 'Euphoric', 'Creative', 'Happy', 'Uplifted'],
    flavors: ['Lemon', 'Citrus', 'Sweet', 'Tangy'],
    medicalUses: ['Depression', 'Fatigue', 'Stress', 'Nausea'],
    description: 'Super Lemon Haze is a two-time Cannabis Cup winner. It delivers an energetic, uplifting high with a strong lemon aroma.',
    growTips: ['Tall plant - needs training', 'Best with SCROG', 'Loves organic nutrients'],
  },
  {
    id: '49',
    name: 'Tahoe OG',
    type: 'indica',
    thc: '18-25%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'moderate',
    effects: ['Relaxed', 'Sleepy', 'Happy', 'Euphoric', 'Hungry'],
    flavors: ['Earthy', 'Pine', 'Lemon', 'Woody'],
    medicalUses: ['Insomnia', 'Pain', 'Stress', 'Muscle Spasms'],
    description: 'Tahoe OG is a potent indica with a lemony, earthy aroma. It delivers a powerful sedative effect that can help with insomnia and chronic pain.',
    growTips: ['Needs low humidity', 'Benefits from LST', 'Moderate feeding'],
  },
  {
    id: '50',
    name: 'Blueberry',
    type: 'indica',
    thc: '17-24%',
    cbd: '<1%',
    floweringTime: '8-9 weeks',
    yield: 'Medium',
    difficulty: 'easy',
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Sleepy', 'Uplifted'],
    flavors: ['Blueberry', 'Berry', 'Sweet', 'Earthy'],
    medicalUses: ['Pain', 'Stress', 'Depression', 'Insomnia'],
    description: 'Blueberry is a classic indica strain with a sweet blueberry aroma. It delivers a long-lasting, relaxing body high with a pleasant euphoria.',
    growTips: ['Colors develop in cooler temps', 'Easy to grow', 'Award-winning genetics'],
  },
];

// ============================================
// Available Effects & Flavors
// ============================================

const ALL_EFFECTS = [
  'Euphoric', 'Happy', 'Relaxed', 'Uplifted', 'Creative', 'Energetic',
  'Focused', 'Sleepy', 'Hungry', 'Giggly', 'Talkative', 'Aroused',
  'Tingly', 'Clear-headed'
];

const ALL_FLAVORS = [
  'Sweet', 'Earthy', 'Berry', 'Citrus', 'Pine', 'Woody', 'Diesel',
  'Grape', 'Tropical', 'Pungent', 'Skunk', 'Spicy', 'Herbal', 'Lemon',
  'Blueberry', 'Orange', 'Mint', 'Vanilla', 'Pepper', 'Coffee', 'Flowery',
  'Ammonia', 'Apple', 'Apricot', 'Chestnut', 'Cheese', 'Chemical',
  'Rose', 'Minty', 'Pineapple', 'Lavender', 'Tangerine', 'Tangy',
  'Mango', 'Olive oil', 'Creamy', 'Sour', 'Floral', 'Banana', 'Chocolate'
];

// ============================================
// Custom Strains (user-added, persisted in localStorage)
// ============================================

const CUSTOM_STRAINS_KEY = 'cannaai-custom-strains';

function loadCustomStrains(): Strain[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STRAINS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomStrains(strains: Strain[]): void {
  localStorage.setItem(CUSTOM_STRAINS_KEY, JSON.stringify(strains));
}

export async function addStrain(strain: Omit<Strain, 'id'>): Promise<Strain> {
  const custom = loadCustomStrains();
  const newStrain: Strain = {
    ...strain,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  custom.push(newStrain);
  saveCustomStrains(custom);
  return newStrain;
}

export async function deleteCustomStrain(id: string): Promise<void> {
  const custom = loadCustomStrains().filter((s) => s.id !== id);
  saveCustomStrains(custom);
}

function getAllStrains(): Strain[] {
  return [...LOCAL_STRAINS, ...loadCustomStrains()];
}

// ============================================
// Public API
// ============================================

export async function fetchStrainsByType(type: string): Promise<Strain[]> {
  await new Promise((r) => setTimeout(r, 100));
  const t = type.toLowerCase();
  return getAllStrains().filter((s) => s.type === t);
}

export async function searchStrainsByName(query: string): Promise<Strain[]> {
  await new Promise((r) => setTimeout(r, 100));
  const q = query.toLowerCase();
  return getAllStrains().filter((s) => s.name.toLowerCase().includes(q));
}

export async function fetchStrainsByEffect(effect: string): Promise<Strain[]> {
  await new Promise((r) => setTimeout(r, 100));
  const e = effect.toLowerCase();
  return getAllStrains().filter((s) =>
    s.effects.some((eff) => eff.toLowerCase() === e)
  );
}

export async function fetchStrainsByFlavor(flavor: string): Promise<Strain[]> {
  await new Promise((r) => setTimeout(r, 100));
  const f = flavor.toLowerCase();
  return getAllStrains().filter((s) =>
    s.flavors.some((fl) => fl.toLowerCase() === f)
  );
}

export async function fetchAllEffects(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 50));
  return ALL_EFFECTS;
}

export async function fetchAllFlavors(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 50));
  return ALL_FLAVORS;
}

export async function fetchAllStrains(): Promise<Strain[]> {
  await new Promise((r) => setTimeout(r, 100));
  return getAllStrains();
}

// ============================================
// Local Search/Filter (for loaded strains)
// ============================================

export function searchStrains(strains: Strain[], query: string): Strain[] {
  const q = query.toLowerCase();
  return strains.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q) ||
      s.effects.some((e) => e.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q)
  );
}

export function filterStrains(strains: Strain[], filters: {
  type?: string;
  difficulty?: string;
}): Strain[] {
  return strains.filter((s) => {
    if (filters.type && filters.type !== 'all' && s.type !== filters.type) return false;
    return true;
  });
}
