// ============================================
// Plant Doctor Agent — Diagnostic Tools
// Small, focused tools the agent can call
// ============================================

import type { GrowthStage, ProviderConfig } from '../types';
import { searchStrainsByName } from './strains';
import { performWebSearch, loadWebSearchConfig } from './web-search';
import { loadTemperatureUnit, celsiusToFahrenheit } from '../utils/storage';
import { quickTeamConsult } from './team-orchestrator';

// --- Tool registry ---

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const tools: AgentTool[] = [];
let _providers: ProviderConfig[] = [];

function registerTool(tool: AgentTool) {
  tools.push(tool);
}

/** Inject providers so tools that need LLM access (e.g. consult_council) can use them. */
export function setToolProviders(providers: ProviderConfig[]) {
  _providers = providers;
}

export function getTools(): AgentTool[] {
  return [...tools];
}

export function getTool(name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name);
}

export function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `### ${t.name}\n${t.description}\nParameters: ${JSON.stringify(t.parameters, null, 2)}`
    )
    .join('\n\n');
}

// ============================================
// Tool: lookup_strain
// ============================================

registerTool({
  name: 'lookup_strain',
  description:
    'Look up detailed information about a cannabis/hemp strain including type, THC/CBD levels, flowering time, difficulty, known grow tips, and common issues.',
  parameters: {
    strain_name: {
      type: 'string',
      description: 'Name or partial name of the strain to look up',
      required: true,
    },
  },
  execute: async (args) => {
    const query = String(args.strain_name || '');
    const results = await searchStrainsByName(query);
    if (results.length === 0) {
      return JSON.stringify({ found: false, message: `No strain matching "${query}" found in the library.` });
    }
    return JSON.stringify({
      found: true,
      matches: results.map((s) => ({
        name: s.name,
        type: s.type,
        thc: s.thc,
        cbd: s.cbd,
        floweringTime: s.floweringTime,
        yield: s.yield,
        difficulty: s.difficulty,
        effects: s.effects,
        medicalUses: s.medicalUses,
        growTips: s.growTips,
        description: s.description,
      })),
    });
  },
});

// ============================================
// Tool: check_environment
// ============================================

interface EnvCheck {
  parameter: string;
  value: number;
  optimal_min: number;
  optimal_max: number;
  unit: string;
  status: 'optimal' | 'warning' | 'critical';
  deviation: string;
  impact: string;
}

registerTool({
  name: 'check_environment',
  description:
    'Check environmental parameters (temperature, humidity, pH, VPD) against optimal ranges for a given growth stage. Returns deviation analysis and impact assessment. Accept temperature in Celsius (temperature_c) or Fahrenheit (temperature_f).',
  parameters: {
    temperature_c: { type: 'number', description: 'Temperature in Celsius', required: false },
    temperature_f: { type: 'number', description: 'Temperature in Fahrenheit (will be converted to Celsius internally)', required: false },
    humidity_pct: { type: 'number', description: 'Relative humidity percentage', required: false },
    ph_level: { type: 'number', description: 'pH level of water/soil', required: false },
    growth_stage: {
      type: 'string',
      description: 'Growth stage: seedling, vegetative, pre-flower, flowering, late-flower, harvest-ready',
      required: false,
    },
  },
  execute: async (args) => {
    const stage = String(args.growth_stage || 'vegetative') as GrowthStage;
    const checks: EnvCheck[] = [];

    // Convert Fahrenheit to Celsius if provided
    let tempCelsius: number | undefined;
    if (args.temperature_c !== undefined) {
      tempCelsius = Number(args.temperature_c);
    } else if (args.temperature_f !== undefined) {
      tempCelsius = Math.round(((Number(args.temperature_f) - 32) * 5) / 9);
    }

    // Temperature ranges by stage (always in Celsius internally)
    const tempRanges: Record<string, [number, number]> = {
      seedling: [20, 25],
      vegetative: [22, 28],
      'pre-flower': [22, 26],
      flowering: [20, 26],
      'late-flower': [18, 24],
      'harvest-ready': [18, 22],
      drying: [15, 21],
      curing: [15, 21],
    };

    // Humidity ranges by stage
    const humidityRanges: Record<string, [number, number]> = {
      seedling: [65, 80],
      vegetative: [50, 70],
      'pre-flower': [45, 60],
      flowering: [40, 55],
      'late-flower': [35, 50],
      'harvest-ready': [30, 45],
      drying: [45, 55],
      curing: [55, 62],
    };

    if (tempCelsius !== undefined) {
      const temp = tempCelsius;
      const [min, max] = tempRanges[stage] || [20, 26];
      const status = temp >= min && temp <= max ? 'optimal' : temp >= min - 3 && temp <= max + 3 ? 'warning' : 'critical';
      const useF = args.temperature_f !== undefined;
      const displayTemp = useF ? Math.round((temp * 9) / 5 + 32) : temp;
      const displayMin = useF ? Math.round((min * 9) / 5 + 32) : min;
      const displayMax = useF ? Math.round((max * 9) / 5 + 32) : max;
      const unit = useF ? '°F' : '°C';
      const deviation = temp < min ? `${displayMin - displayTemp}${unit} below optimal` : temp > max ? `${displayTemp - displayMax}${unit} above optimal` : 'within range';
      const impact =
        temp < min
          ? 'Slow growth, nutrient uptake issues, potential calcium/magnesium lockout'
          : temp > max
            ? 'Heat stress, increased transpiration, pest vulnerability, terpene loss'
            : 'Optimal for metabolic processes';
      checks.push({ parameter: 'Temperature', value: displayTemp, optimal_min: displayMin, optimal_max: displayMax, unit, status, deviation, impact });
    }

    if (args.humidity_pct !== undefined) {
      const hum = Number(args.humidity_pct);
      const [min, max] = humidityRanges[stage] || [40, 60];
      const status = hum >= min && hum <= max ? 'optimal' : hum >= min - 10 && hum <= max + 10 ? 'warning' : 'critical';
      const deviation = hum < min ? `${min - hum}% below optimal` : hum > max ? `${hum - max}% above optimal` : 'within range';
      const impact =
        hum < min
          ? 'Stomata close, reduced CO2 uptake, nutrient transport issues'
          : hum > max
            ? 'Powdery mildew, botrytis risk, mold in dense buds'
            : 'Optimal for transpiration and gas exchange';
      checks.push({ parameter: 'Humidity', value: hum, optimal_min: min, optimal_max: max, unit: '%', status, deviation, impact });
    }

    if (args.ph_level !== undefined) {
      const ph = Number(args.ph_level);
      // pH is medium-dependent but general ranges:
      const min = 6.0;
      const max = 7.0;
      const status = ph >= min && ph <= max ? 'optimal' : ph >= 5.5 && ph <= 7.5 ? 'warning' : 'critical';
      const deviation = ph < min ? `${(min - ph).toFixed(1)} below optimal` : ph > max ? `${(ph - max).toFixed(1)} above optimal` : 'within range';
      const impact =
        ph < 6.0
          ? 'Nutrient lockout: P, Ca, Mg become unavailable. Root damage likely below 5.5.'
          : ph > 7.0
            ? 'Nutrient lockout: Fe, Mn, Zn, Cu, B become unavailable. Iron deficiency likely.'
            : 'Optimal nutrient availability';
      checks.push({ parameter: 'pH', value: ph, optimal_min: min, optimal_max: max, unit: '', status, deviation, impact });
    }

    // Calculate VPD if both temp and humidity provided
    if (tempCelsius !== undefined && args.humidity_pct !== undefined) {
      const temp = tempCelsius;
      const hum = Number(args.humidity_pct);
      // VPD formula: satVP - (satVP * RH/100)
      const satVP = 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
      const vpd = satVP * (1 - hum / 100);
      const vpdMin = stage === 'seedling' ? 0.4 : stage.includes('flower') ? 0.8 : 0.6;
      const vpdMax = stage === 'seedling' ? 0.8 : stage.includes('flower') ? 1.4 : 1.2;
      const status = vpd >= vpdMin && vpd <= vpdMax ? 'optimal' : vpd >= vpdMin - 0.2 && vpd <= vpdMax + 0.2 ? 'warning' : 'critical';
      const deviation = vpd < vpdMin ? `${(vpdMin - vpd).toFixed(2)} kPa below optimal` : vpd > vpdMax ? `${(vpd - vpdMax).toFixed(2)} kPa above optimal` : 'within range';
      const impact =
        vpd < vpdMin
          ? 'Stomata close, slow transpiration, nutrient transport impaired'
          : vpd > vpdMax
            ? 'Excessive transpiration, leaf curl, stomata close defensively'
            : 'Optimal transpiration and nutrient transport';
      checks.push({ parameter: 'VPD', value: Math.round(vpd * 100) / 100, optimal_min: vpdMin, optimal_max: vpdMax, unit: 'kPa', status, deviation, impact });
    }

    return JSON.stringify({ growth_stage: stage, checks, overall_status: checks.some((c) => c.status === 'critical') ? 'critical' : checks.some((c) => c.status === 'warning') ? 'warning' : 'optimal' });
  },
});

// ============================================
// Tool: match_symptoms
// ============================================

interface SymptomMatch {
  issue: string;
  type: 'deficiency' | 'toxicity' | 'pest' | 'disease' | 'environmental' | 'stress';
  matchScore: number;
  matchedSymptoms: string[];
  missingSymptoms: string[];
  description: string;
  treatment: string;
}

const SYMPTOM_DB: Array<{
  issue: string;
  type: SymptomMatch['type'];
  symptoms: string[];
  description: string;
  treatment: string;
}> = [
  // =============================================
  // NUTRIENT DEFICIENCIES
  // =============================================
  {
    issue: 'Nitrogen Deficiency',
    type: 'deficiency',
    symptoms: ['yellowing leaves', 'yellow lower leaves', 'pale leaves', 'slow growth', 'leaf drop', 'stunted growth', 'chlorosis', 'wilting', 'drooping', 'leaf curling', 'thin stems', 'small leaves', 'fading color', 'light green leaves', 'bottom leaves yellow', 'old leaves yellow', 'premature senescence', 'reduced vigor', 'pale green foliage'],
    description: 'N deficiency starts with yellowing of older/lower leaves, progressing upward. Leaves may curl downward, become pale, and drop prematurely. Severe cases show wilting and thin stems.',
    treatment: 'Increase nitrogen feeding. Use fish emulsion, blood meal, or calcium nitrate. Check pH is 6.0-7.0 for uptake.',
  },
  {
    issue: 'Phosphorus Deficiency',
    type: 'deficiency',
    symptoms: ['purple stems', 'dark leaves', 'slow growth', 'stunted growth', 'purple leaves', 'red stems', 'dark green leaves', 'bronze leaves', 'leaf discoloration', 'poor flowering', 'small buds', 'red purple underside', 'leaf necrosis', 'delayed maturity'],
    description: 'P deficiency causes darkening of leaves and purple/reddish stems, especially in flowering. Buds may be small and airy.',
    treatment: 'Add bloom nutrients with higher P. Use bone meal or rock phosphate. Ensure pH above 6.0.',
  },
  {
    issue: 'Potassium Deficiency',
    type: 'deficiency',
    symptoms: ['burnt leaf tips', 'brown spots', 'leaf curling', 'yellowing leaves', 'weak stems', 'brown edges', 'crispy edges', 'leaf scorch', 'rust spots', 'small buds', 'poor disease resistance', 'necrotic margins', 'interveinal scorch', 'branch breakage'],
    description: 'K deficiency shows as brown/crispy leaf edges and tips, with interveinal chlorosis in older leaves. Buds may be small.',
    treatment: 'Increase potassium with kelp meal, potassium sulfate, or wood ash. Check for salt buildup.',
  },
  {
    issue: 'Magnesium Deficiency',
    type: 'deficiency',
    symptoms: ['yellowing leaves', 'interveinal chlorosis', 'brown spots', 'leaf curling', 'purple stems', 'green veins yellow between', 'marbled leaves', 'yellow between veins', 'rust patches', 'leaf margin curl', 'mottled leaves', 'bronze patches'],
    description: 'Mg deficiency causes interveinal yellowing (green veins, yellow between) on older leaves first. Leaves look marbled.',
    treatment: 'Add Epsom salt (MgSO4) at 1 tsp per gallon. Foliar spray for quick absorption. Check pH.',
  },
  {
    issue: 'Iron Deficiency',
    type: 'deficiency',
    symptoms: ['yellowing leaves', 'pale leaves', 'chlorosis', 'new growth yellow', 'stunted growth', 'young leaves yellow', 'white leaves', 'veins green yellow between', 'top growth yellow', 'new leaves pale', 'interveinal chlorosis new growth', 'white necrotic spots'],
    description: 'Fe deficiency affects new/upper growth first — young leaves turn yellow while veins stay green.',
    treatment: 'Lower pH to 6.0-6.5. Add chelated iron. Check for root issues affecting uptake.',
  },
  {
    issue: 'Calcium Deficiency',
    type: 'deficiency',
    symptoms: ['brown spots', 'stunted growth', 'new growth curl', 'weak stems', 'crispy leaves', 'copper spots', 'distorted growth', 'leaf tip burn', 'blossom end rot', 'hollow stems', 'brittle stems', 'dead spots', 'branch weakness', 'root tip die back'],
    description: 'Ca deficiency causes brown/copper spots on newer leaves, distorted growth, and weak cell walls.',
    treatment: 'Add calcium carbonate, gypsum, or cal-mag supplement. Ensure pH 6.2-7.0.',
  },
  {
    issue: 'Sulfur Deficiency',
    type: 'deficiency',
    symptoms: ['yellowing leaves', 'new growth yellow', 'pale leaves', 'thin stems', 'stunted growth', 'yellow young leaves', 'leaf veins yellow', 'purple streaks stems', 'small buds'],
    description: 'S deficiency resembles nitrogen deficiency but affects new growth first. Leaves turn pale green to yellow.',
    treatment: 'Add Epsom salt or sulfur-containing fertilizer. Check pH — S is available 6.0-7.0.',
  },
  {
    issue: 'Manganese Deficiency',
    type: 'deficiency',
    symptoms: ['interveinal chlorosis', 'brown spots', 'yellow spots', 'new growth yellow', 'leaf speckling', 'necrotic spots', 'grey speckling', 'young leaves mottled', 'chlorotic patches'],
    description: 'Mn deficiency causes interveinal chlorosis on young leaves with brown necrotic spots.',
    treatment: 'Lower pH to 6.0-6.5. Add manganese sulfate. Flush if salt buildup suspected.',
  },
  {
    issue: 'Zinc Deficiency',
    type: 'deficiency',
    symptoms: ['small leaves', 'leaf curling', 'stunted growth', 'distorted leaves', 'yellow spots', 'short internodes', 'rosette growth', 'leaf puckering', 'banding on leaves', 'reduced branching'],
    description: 'Zn deficiency causes small, distorted leaves with yellowing between veins. Growth is stunted with short internodes.',
    treatment: 'Add zinc sulfate or chelated zinc. Check pH — Zn is locked out above 7.0.',
  },
  {
    issue: 'Boron Deficiency',
    type: 'deficiency',
    symptoms: ['distorted growth', 'thick leaves', 'brittle stems', 'growing tips die', 'brown growing tips', 'twisted leaves', 'hollow stems', 'abnormal branching', 'flower abortion', 'root swelling'],
    description: 'B deficiency causes distorted growth, thick/brittle leaves, and death of growing tips.',
    treatment: 'Add boric acid (1/4 tsp per gallon). Check pH — B is locked out above 7.0.',
  },
  {
    issue: 'Copper Deficiency',
    type: 'deficiency',
    symptoms: ['wilting', 'dark leaves', 'new growth wilt', 'blue tint', 'leaf metallic sheen', 'slow growth', 'delayed flowering', 'twisted tips'],
    description: 'Cu deficiency causes wilting of new growth, dark leaves with possible blue/metallic tint.',
    treatment: 'Add copper sulfate or chelated copper. Check pH — Cu is locked out above 7.0.',
  },
  {
    issue: 'Molybdenum Deficiency',
    type: 'deficiency',
    symptoms: ['yellowing leaves', 'leaf margin curl', 'cupping leaves', 'stunted growth', 'old leaves yellow', 'interveinal chlorosis', 'leaf edge necrosis', 'whiptail'],
    description: 'Mo deficiency is rare but causes yellowing and cupping of older leaves. Often confused with nitrogen deficiency.',
    treatment: 'Adjust pH to 6.0-7.0. Add sodium molybdate or ammonium molybdate. Usually corrected by fixing pH.',
  },
  {
    issue: 'Silicon Deficiency',
    type: 'deficiency',
    symptoms: ['weak stems', 'leaf drooping', 'poor heat tolerance', 'pest vulnerability', 'thin cell walls', 'falling over'],
    description: 'Si deficiency results in weak structural support, increased pest susceptibility, and poor stress tolerance.',
    treatment: 'Add silica supplement (potassium silicate). Use throughout veg and early flower. Do not mix directly with concentrated nutrients.',
  },
  // =============================================
  // NUTRIENT TOXICITIES
  // =============================================
  {
    issue: 'Nitrogen Toxicity',
    type: 'toxicity',
    symptoms: ['dark green leaves', 'leaf clawing', 'curled down leaves', 'thick stems', 'delayed flowering', 'burnt tips', 'excess growth', 'very green leaves', 'drooping tips', 'abnormal dark color', 'shiny leaves'],
    description: 'N toxicity causes very dark green leaves with tips curling downward (clawing). Growth is lush but flowering is delayed.',
    treatment: 'Flush with plain pH\'d water. Reduce nitrogen feeding. Switch to bloom nutrients if in flower.',
  },
  {
    issue: 'Phosphorus Toxicity',
    type: 'toxicity',
    symptoms: ['nutrient lockout', 'zinc deficiency', 'iron deficiency', 'copper deficiency', 'bronze leaves', 'stunted growth', 'dark leaves', 'salt buildup'],
    description: 'P toxicity locks out zinc, iron, and copper. Shows as secondary deficiencies and dark, unhealthy foliage.',
    treatment: 'Flush with plain pH\'d water. Reduce bloom booster. Check and correct micronutrient levels.',
  },
  {
    issue: 'Potassium Toxicity',
    type: 'toxicity',
    symptoms: ['calcium lockout', 'magnesium lockout', 'salt burn', 'burnt tips', 'crunchy edges', 'interveinal chlorosis', 'salt deposits'],
    description: 'K toxicity causes calcium and magnesium lockout. Salt buildup visible on soil surface.',
    treatment: 'Flush with 3x pot volume plain water. Reduce K-heavy nutrients. Add Cal-Mag to restore balance.',
  },
  {
    issue: 'Nutrient Burn',
    type: 'toxicity',
    symptoms: ['burnt leaf tips', 'brown tips', 'yellowing leaves', 'leaf curling', 'crispy leaves', 'tip burn', 'salt buildup', 'white residue on soil', 'nutrient lockout', 'burnt edges', 'leaf scorch'],
    description: 'Nutrient burn starts at leaf tips and edges, progressing if feeding is not reduced.',
    treatment: 'Flush with plain pH\'d water. Reduce nutrient concentration by 25-50%. Gradually resume feeding.',
  },
  {
    issue: 'Calcium Toxicity',
    type: 'toxicity',
    symptoms: ['magnesium lockout', 'potassium lockout', 'iron lockout', 'dark leaves', 'pH rise root zone', 'salt deposits', 'stunted growth'],
    description: 'Ca excess locks out Mg, K, and Fe. Raises root zone pH. Common with hard water or over-liming.',
    treatment: 'Reduce calcium inputs. Flush to reset medium. Add Epsom salt to restore Mg balance.',
  },
  {
    issue: 'Iron Toxicity',
    type: 'toxicity',
    symptoms: ['bronze leaves', 'dark coloring', 'phosphorus lockout', 'stunted growth', 'brown spots', 'root damage', 'leaf bronzing'],
    description: 'Fe toxicity causes bronzing of leaves and locks out phosphorus. Can damage roots at high concentrations.',
    treatment: 'Raise pH if too low. Flush with plain water. Stop iron supplementation.',
  },
  // =============================================
  // PESTS
  // =============================================
  {
    issue: 'Spider Mites',
    type: 'pest',
    symptoms: ['webbing', 'stippling', 'small insects', 'yellowing leaves', 'brown spots', 'discoloration', 'tiny dots underside', 'leaf speckling', 'fine webs', 'mites', 'yellow dots', 'leaf bronzing'],
    description: 'Spider mites cause fine stippling on leaves, eventually webbing. Underside of leaves shows tiny dots.',
    treatment: 'Neem oil, insecticidal soap, or predatory mites (Phytoseiulus persimilis). Increase humidity temporarily.',
  },
  {
    issue: 'Thrips',
    type: 'pest',
    symptoms: ['silver streaks', 'discoloration', 'brown spots', 'small insects', 'leaf curling', 'shiny streaks', 'black dots on leaves', 'silvery patches', 'scarring', 'irregular patches'],
    description: 'Thrips leave silver/white streaks on leaves and small black fecal dots. Active mainly on leaf undersides.',
    treatment: 'Spinosad, neem oil, or blue sticky traps. Biological control with Amblyseius cucumeris.',
  },
  {
    issue: 'Aphids',
    type: 'pest',
    symptoms: ['sticky residue', 'leaf curling', 'small insects', 'wilting', 'discoloration', 'ants present', 'honeydew', 'green bugs', 'black bugs', 'clustered insects', 'sticky leaves', 'sooty mold', 'deformed new growth'],
    description: 'Aphids cluster on new growth and stems, secreting sticky honeydew. Attract ants.',
    treatment: 'Insecticidal soap, neem oil, ladybugs, or strong water spray. Remove heavily infested areas.',
  },
  {
    issue: 'Fungus Gnats',
    type: 'pest',
    symptoms: ['small flies', 'fungus gnats', 'soil flies', 'tiny flies', 'root damage', 'seedling damage', 'wilting seedlings', 'soil surface flies', 'larvae in soil'],
    description: 'Fungus gnats are small flies near soil surface. Larvae damage roots, especially in seedlings.',
    treatment: 'Let soil dry between waterings. Use yellow sticky traps. Apply Bacillus thuringiensis var. israelensis (BTI).',
  },
  {
    issue: 'Whiteflies',
    type: 'pest',
    symptoms: ['white flies', 'white insects', 'sticky residue', 'yellowing leaves', 'small white bugs', 'fly up when disturbed', 'honeydew', 'sooty mold', 'leaf yellowing'],
    description: 'Whiteflies are tiny white flying insects on leaf undersides. They suck sap and secrete honeydew.',
    treatment: 'Yellow sticky traps, insecticidal soap, neem oil. Introduce Encarsia formosa parasitic wasps.',
  },
  {
    issue: 'Russet Mites',
    type: 'pest',
    symptoms: ['russet leaves', 'bronze leaves', 'yellowing leaves', 'leaf curling', 'stunted growth', 'waxy leaves', 'brown leaves', 'oily appearance', 'leaf texture change', 'lower canopy damage'],
    description: 'Russet mites cause bronzing/russeting of leaves, often starting at lower canopy. Leaves look waxy or oily.',
    treatment: 'Sulfur spray, neem oil, or predatory mites (Amblyseius swirskii). Remove heavily infested leaves.',
  },
  {
    issue: 'Broad Mites',
    type: 'pest',
    symptoms: ['leaf curling', 'distorted growth', 'new growth curl', 'bronze leaves', 'thick leaves', 'twisted leaves', 'stunted growth', 'dark green hardened leaves', 'internode shortening'],
    description: 'Broad mites inject toxins causing severe leaf curling and distortion of new growth. Often invisible to naked eye.',
    treatment: 'Forbid, Avid, or neem oil. Remove affected growth. Introduce predatory mites (Neoseiulus californicus).',
  },
  {
    issue: 'Caterpillars',
    type: 'pest',
    symptoms: ['holes in leaves', 'chewed leaves', 'missing leaf sections', 'frass', 'caterpillar', 'worms', 'green worms', 'bore holes in stems', 'bud damage', 'droppings on leaves'],
    description: 'Caterpillars chew holes in leaves and can bore into stems and buds. Look for frass (droppings).',
    treatment: 'Bacillus thuringiensis (BT) spray. Hand-pick caterpillars. Spinosad for severe infestations.',
  },
  {
    issue: 'Leaf Miners',
    type: 'pest',
    symptoms: ['serpentine trails', 'white trails', 'tunnels in leaves', 'mining patterns', 'leaf damage', 'winding lines on leaves', 'blotch mines'],
    description: 'Leaf miners create winding white trails through leaf tissue as larvae feed between leaf layers.',
    treatment: 'Remove affected leaves. Neem oil as preventive. Spinosad or parasitic wasps (Diglyphus isaea).',
  },
  {
    issue: 'Root Aphids',
    type: 'pest',
    symptoms: ['wilting', 'slow growth', 'yellowing leaves', 'root damage', 'soil surface insects', 'white bugs on roots', 'stunted growth', 'poor nutrient uptake', 'wilting despite watering'],
    description: 'Root aphids feed on roots underground, causing wilting and stunted growth. Often confused with nutrient deficiency.',
    treatment: 'Drench with Beauveria bassiana or hydrogen peroxide root wash. Apply systemic insecticide if severe.',
  },
  {
    issue: 'Mealybugs',
    type: 'pest',
    symptoms: ['white cottony masses', 'sticky residue', 'honeydew', 'wilting', 'stunted growth', 'yellowing leaves', 'sooty mold', 'white fuzzy bugs', 'waxy clusters'],
    description: 'Mealybugs are soft-bodied insects covered in white waxy coating. They cluster in leaf joints and under leaves.',
    treatment: 'Isopropyl alcohol on cotton swab for spot treatment. Insecticidal soap. Neem oil. Release Cryptolaemus beetles.',
  },
  {
    issue: 'Scale Insects',
    type: 'pest',
    symptoms: ['brown bumps', 'shell-like bumps', 'sticky residue', 'yellowing leaves', 'wilting', 'bark discoloration', 'honeydew', 'sooty mold', 'waxy shells'],
    description: 'Scale insects attach to stems and leaves under protective shells. They suck sap and weaken the plant.',
    treatment: 'Scrape off manually. Apply horticultural oil or neem oil. Systemic insecticide for severe infestations.',
  },
  {
    issue: 'Grasshoppers',
    type: 'pest',
    symptoms: ['large holes in leaves', 'chewed stems', 'missing foliage', 'ragged leaf edges', 'defoliation', 'chewed buds'],
    description: 'Grasshoppers cause large, ragged holes in leaves and can rapidly defoliate outdoor plants.',
    treatment: 'Physical barriers (netting). Nosema locustae bait. Neem oil as deterrent. Hand-pick if few.',
  },
  {
    issue: 'Slugs and Snails',
    type: 'pest',
    symptoms: ['slime trails', 'large holes in leaves', 'irregular damage', 'silvery slime', 'missing seedlings', 'chewed lower leaves', 'nighttime damage'],
    description: 'Slugs and snails feed at night, leaving slime trails and large irregular holes in lower leaves.',
    treatment: 'Diatomaceous earth barrier. Beer traps. Iron phosphate bait. Copper tape around pots.',
  },
  {
    issue: 'Earwigs',
    type: 'pest',
    symptoms: ['irregular holes', 'chewed petals', 'damaged seedlings', 'small holes in leaves', 'nighttime feeding damage', 'chewed buds'],
    description: 'Earwigs feed at night on leaves and flowers, creating irregular holes and damage.',
    treatment: 'Oil pit traps. Diatomaceous earth. Reduce mulch near plants. Neem oil spray.',
  },
  {
    issue: 'Springtails',
    type: 'pest',
    symptoms: ['tiny jumping insects', 'soil surface bugs', 'white jumping bugs', 'moisture loving pests', 'soil surface activity'],
    description: 'Springtails are tiny jumping insects in moist soil. Usually harmless but indicate overwatering.',
    treatment: 'Let soil dry between waterings. Usually beneficial — they break down organic matter. Only treat if excessive.',
  },
  {
    issue: 'Hemp Russet Mite',
    type: 'pest',
    symptoms: ['wilting', 'yellowing leaves', 'stunted growth', 'leaf curling', 'reduced vigor', 'bud damage', 'resin reduction', 'plant decline', 'microscopic mites', 'hemp specific pest'],
    description: 'Hemp russet mites (Aculops cannabicola) are specific to cannabis. They reduce resin production and cause overall decline.',
    treatment: 'Sulfur spray (veg only — not in flower). Forbid or Avid. Remove and destroy heavily infested plants.',
  },
  // =============================================
  // DISEASES
  // =============================================
  {
    issue: 'Powdery Mildew',
    type: 'disease',
    symptoms: ['white powder', 'white spots', 'mold', 'discoloration', 'wilting', 'white film', 'powdery coating', 'white patches', 'fuzzy white', 'powdery residue', 'leaf curling'],
    description: 'PM appears as white powdery patches on leaves, spreading to stems and buds if untreated.',
    treatment: 'Potassium bicarbonate spray, neem oil, or sulfur burner. Increase airflow, reduce humidity below 50%.',
  },
  {
    issue: 'Botrytis (Bud Rot)',
    type: 'disease',
    symptoms: ['mold', 'brown buds', 'wilting', 'discoloration', 'grey mold', 'bud rot', 'mushy buds', 'brown inner buds', 'grey fuzzy mold', 'dying buds', 'webbing in buds', 'dark pistils'],
    description: 'Grey mold attacks dense buds from inside. Inner stems turn brown and mushy.',
    treatment: 'Remove affected buds immediately. Increase airflow, reduce humidity below 45%. No cure — prevention only.',
  },
  {
    issue: 'Root Rot (Pythium)',
    type: 'disease',
    symptoms: ['wilting', 'slow growth', 'yellowing leaves', 'drooping', 'stunted growth', 'brown roots', 'slimy roots', 'mushy roots', 'foul smell', 'dark roots', 'root discoloration', 'poor drainage'],
    description: 'Pythium root rot causes wilting despite adequate watering. Roots turn brown and slimy.',
    treatment: 'Hydrogen peroxide flush, beneficial microbes (Great White, Recharge). Fix overwatering. Ensure drainage.',
  },
  {
    issue: 'Damping Off',
    type: 'disease',
    symptoms: ['seedling collapse', 'stem rot', 'thin stems', 'seedling falling', 'stem base brown', 'seedling wilting', 'seedling death', 'water soaked stem'],
    description: 'Damping off causes seedling stems to rot at the base, causing them to fall over and die.',
    treatment: 'Improve drainage, reduce watering. Use sterile growing medium. Apply Trichoderma or mycorrhizae.',
  },
  {
    issue: 'Fusarium Wilt',
    type: 'disease',
    symptoms: ['wilting', 'yellowing leaves', 'brown vascular tissue', 'stem discoloration', 'one sided wilt', 'plant collapse', 'brown streaks stem', 'slow decline'],
    description: 'Fusarium is a soil-borne fungus that blocks water transport. Causes wilting on one side and brown vascular tissue.',
    treatment: 'No cure — remove and destroy infected plants. Sterilize tools. Use Trichoderma as prevention. Rotate crops.',
  },
  {
    issue: 'Verticillium Wilt',
    type: 'disease',
    symptoms: ['wilting', 'yellowing leaves', 'V shaped leaf lesions', 'brown vascular tissue', 'stunted growth', 'leaf drop', 'one sided yellowing', 'slow decline'],
    description: 'Verticillium causes V-shaped yellowing/browning on leaves and wilting. Soil-borne pathogen.',
    treatment: 'No cure — remove infected plants. Soil solarization. Use resistant varieties. Rotate crops for 3-5 years.',
  },
  {
    issue: 'Septoria Leaf Spot',
    type: 'disease',
    symptoms: ['brown spots', 'yellow spots', 'circular spots', 'dark borders', 'leaf yellowing', 'lower leaf damage', 'premature leaf drop', 'small brown circles', 'grey centers'],
    description: 'Septoria causes small circular brown spots with dark borders, starting on lower leaves and spreading upward.',
    treatment: 'Remove affected leaves. Apply copper fungicide or neem oil. Improve airflow. Avoid overhead watering.',
  },
  {
    issue: 'Alternaria Leaf Spot',
    type: 'disease',
    symptoms: ['brown spots', 'concentric rings', 'target spots', 'dark brown patches', 'leaf yellowing', 'premature leaf drop', 'oval lesions'],
    description: 'Alternaria causes dark brown spots with concentric ring patterns (target-like). Starts on lower leaves.',
    treatment: 'Remove affected foliage. Apply copper fungicide. Improve airflow. Reduce leaf wetness.',
  },
  {
    issue: 'Sooty Mold',
    type: 'disease',
    symptoms: ['black coating', 'dark film on leaves', 'sticky leaves', 'black powder', 'reduced photosynthesis', 'dull leaves', 'honeydew present'],
    description: 'Sooty mold grows on honeydew secreted by aphids, whiteflies, or other sap-sucking pests. Black coating blocks light.',
    treatment: 'Treat underlying pest infestation first. Wash leaves with dilute soap solution. Neem oil prevents recurrence.',
  },
  {
    issue: 'Tobacco Mosaic Virus (TMV)',
    type: 'disease',
    symptoms: ['mosaic pattern', 'mottled leaves', 'yellow green pattern', 'distorted growth', 'stunted growth', 'leaf curling', 'light dark patches', 'chlorotic mosaic', 'reduced yield'],
    description: 'TMV causes mosaic light/dark green patterns on leaves. Stunts growth and reduces yield. Spreads by contact.',
    treatment: 'No cure — remove infected plants. Disinfect tools between plants. Don\'t use tobacco products near plants.',
  },
  {
    issue: 'Hop Latent Viroid (HLVd)',
    type: 'disease',
    symptoms: ['stunted growth', 'reduced yield', 'small buds', 'weak branches', 'slow growth', 'leaf curling', 'chlorosis', 'brittle stems', 'reduced potency', 'dudding', 'poor trichome production'],
    description: 'HLVd (dudding disease) is a viroid specific to cannabis. Causes reduced vigor, lower yield, and diminished potency. Often asymptomatic early.',
    treatment: 'No cure — remove infected plants. Test mother plants. Sterilize clones. Quarantine new genetics. Heat therapy at 37°C may reduce viral load.',
  },
  {
    issue: 'Fusarium Bud Rot',
    type: 'disease',
    symptoms: ['brown buds', 'dry rot', 'bud discoloration', 'wilting buds', 'orange spores', 'pink mold', 'bud death', 'dry crumbling buds'],
    description: 'Fusarium bud rot differs from botrytis — causes dry, crumbling buds with orange/pink spore masses rather than grey fuzzy mold.',
    treatment: 'Remove affected buds. Reduce humidity. Improve airflow. No chemical cure. Prevention through resistant genetics.',
  },
  {
    issue: 'Rhizoctonia Root Rot',
    type: 'disease',
    symptoms: ['brown roots', 'stem base rot', 'seedling collapse', 'reddish brown lesions', 'root damage', 'wilting', 'slow growth', 'soil line canker'],
    description: 'Rhizoctonia causes reddish-brown lesions at the soil line and root rot. Common in warm, moist conditions.',
    treatment: 'Improve drainage. Apply Trichoderma harzianum. Reduce watering frequency. Use sterile growing medium.',
  },
  {
    issue: 'Gray Leaf Spot (Stemphylium)',
    type: 'disease',
    symptoms: ['grey spots', 'brown spots', 'irregular lesions', 'leaf yellowing', 'premature defoliation', 'olive grey patches', 'spore masses'],
    description: 'Gray leaf spot causes olive-grey to brown irregular spots on leaves, leading to premature defoliation.',
    treatment: 'Remove affected leaves. Apply copper fungicide. Improve airflow and reduce humidity.',
  },
  {
    issue: 'Downy Mildew',
    type: 'disease',
    symptoms: ['yellow spots upper leaf', 'grey fuzz underside', 'leaf yellowing', 'purple grey mold', 'wilting', 'leaf curling', 'spore production underside'],
    description: 'Downy mildew appears as yellow patches on upper leaf surface with grey-purple fuzz on the underside.',
    treatment: 'Remove affected foliage. Apply phosphorous acid fungicide. Reduce humidity. Increase airflow.',
  },
  // =============================================
  // ENVIRONMENTAL STRESS
  // =============================================
  {
    issue: 'Heat Stress',
    type: 'environmental',
    symptoms: ['leaf curling', 'wilting', 'burnt leaf tips', 'drooping', 'yellowing leaves', 'heat curl', 'upward curl', 'foxtailing', 'heat damage', 'wilting in light'],
    description: 'Heat stress causes leaf edges curling upward, wilting during lights-on, and foxtailing in flower.',
    treatment: 'Lower temperature to 22-26°C. Improve ventilation. Move lights higher. Water during cooler hours.',
  },
  {
    issue: 'Light Burn',
    type: 'environmental',
    symptoms: ['bleaching', 'yellowing leaves', 'burnt leaf tips', 'white tips', 'discoloration', 'bleached buds', 'white leaves top', 'light damage', 'chlorosis top growth'],
    description: 'Light burn bleaches upper leaves nearest to light. Affected leaves turn white/yellow from top down.',
    treatment: 'Raise lights or reduce intensity. Check PPFD with a meter — aim for 600-900 µmol/m²/s in flower.',
  },
  {
    issue: 'Cold Stress',
    type: 'environmental',
    symptoms: ['purple leaves', 'purple stems', 'slow growth', 'wilting', 'drooping', 'cold damage', 'stunted growth', 'red stems', 'anthocyanin production', 'phosphorus lockout cold'],
    description: 'Cold temperatures (below 15°C) slow growth, cause purple/red discoloration, and can lock out phosphorus.',
    treatment: 'Raise temperature to 20-26°C. Use root zone heater. Avoid cold drafts.',
  },
  {
    issue: 'Wind Burn',
    type: 'environmental',
    symptoms: ['leaf curling', 'wind damage', 'crispy leaves', 'brown edges', 'leaf tips burnt', 'swaying stems', 'leaf taco', 'wind burn pattern'],
    description: 'Strong wind causes leaf tips and edges to curl and dry out. Common with strong fans.',
    treatment: 'Reduce fan speed or redirect airflow. Oscillating fans are better than constant direct wind.',
  },
  {
    issue: 'Light Stress (Insufficient Light)',
    type: 'environmental',
    symptoms: ['stretching', 'tall thin stems', 'large gaps between nodes', 'pale leaves', 'slow growth', 'falling over', 'reaching for light', 'sparse canopy', 'weak structure'],
    description: 'Insufficient light causes stretching — long internodes, thin stems, and sparse canopy. Plants reach toward light.',
    treatment: 'Increase light intensity or move light closer. Add side lighting. Use training to manage stretch.',
  },
  {
    issue: 'CO2 Deficiency',
    type: 'environmental',
    symptoms: ['slow growth', 'pale leaves', 'reduced photosynthesis', 'stunted growth', 'yellowing', 'small buds', 'poor vigor'],
    description: 'CO2 below 300 ppm limits photosynthesis. Common in sealed rooms without fresh air exchange.',
    treatment: 'Ensure adequate fresh air exchange. Add CO2 supplementation (1200-1500 ppm in flower with enriched air).',
  },
  {
    issue: 'CO2 Excess',
    type: 'environmental',
    symptoms: ['slow growth', 'wilting', 'drooping', 'leaf curl', 'reduced stomata function', 'yellowing leaves', 'stunted growth'],
    description: 'CO2 above 2000 ppm can be toxic. Stomata close, reducing transpiration and nutrient uptake.',
    treatment: 'Reduce CO2 supplementation. Ensure proper ventilation. Target 1200-1500 ppm max during lights-on.',
  },
  {
    issue: 'Transplant Shock',
    type: 'environmental',
    symptoms: ['wilting', 'drooping', 'slow growth', 'yellowing leaves', 'stunted growth', 'leaf drop', 'wilting after transplant', 'root stress'],
    description: 'Transplant shock causes temporary wilting and slowed growth as roots recover from disturbance.',
    treatment: 'Water with transplant solution (B1 vitamins, humic acid). Keep environment stable. Avoid fertilizing for a few days.',
  },
  {
    issue: 'Oxygen Deprivation (Roots)',
    type: 'environmental',
    symptoms: ['wilting', 'yellowing leaves', 'slow growth', 'root rot signs', 'drooping', 'stunted growth', 'waterlogged soil', 'soggy medium', 'poor drainage'],
    description: 'Roots need oxygen. Compacted or waterlogged soil suffocates roots, leading to decline similar to overwatering.',
    treatment: 'Improve drainage. Add perlite to medium. Reduce watering frequency. Use fabric pots for better aeration.',
  },
  {
    issue: 'Photoperiod Disruption',
    type: 'environmental',
    symptoms: ['hermaphrodite', 'nanners', 'reverting to veg', 'confused growth', 'new white pistils', 'foxtailing', 'stress balls', 'bananas in buds', 'light leak stress', 'revegging'],
    description: 'Light leaks or schedule changes during flower cause stress. Can trigger hermaphroditism or revegging.',
    treatment: 'Ensure complete darkness during dark period. Seal all light leaks. Maintain consistent 12/12 schedule.',
  },
  // =============================================
  // WATERING ISSUES
  // =============================================
  {
    issue: 'Overwatering',
    type: 'stress',
    symptoms: ['drooping', 'wilting', 'yellowing leaves', 'slow growth', 'mold', 'fungus gnats', 'heavy leaves', 'wet soil', 'soggy soil', 'edema', 'leaf curling down', 'dark green droopy'],
    description: 'Overwatering causes droopy, heavy leaves. Soil stays wet, inviting fungus gnats and root rot.',
    treatment: 'Let soil dry between waterings (knuckle test). Improve drainage. Water less frequently but thoroughly.',
  },
  {
    issue: 'Underwatering',
    type: 'stress',
    symptoms: ['drooping', 'wilting', 'dry soil', 'crispy leaves', 'leaf curl', 'slow growth', 'light pot', 'dry leaves', 'brittle leaves', 'wilting between waterings'],
    description: 'Underwatering causes droopy, wilted leaves that feel dry and crispy. Pot feels very light.',
    treatment: 'Water thoroughly until runoff. Establish consistent watering schedule. Check soil moisture daily.',
  },
  {
    issue: 'pH Fluctuation',
    type: 'stress',
    symptoms: ['multiple deficiencies', 'nutrient lockout', 'yellowing leaves', 'brown spots', 'stunted growth', 'intermittent problems', 'inconsistent symptoms', 'random leaf damage'],
    description: 'Unstable pH causes intermittent nutrient lockout. Symptoms appear and disappear as pH shifts.',
    treatment: 'Monitor pH at every watering. Buffer soil with dolomite lime. Use pH-stable nutrient lines. Check runoff pH.',
  },
  {
    issue: 'Salt Buildup',
    type: 'stress',
    symptoms: ['burnt tips', 'salt crust soil', 'white residue', 'nutrient lockout', 'EC spike', 'crispy edges', 'yellowing leaves', 'root damage', 'burnt leaf edges'],
    description: 'Accumulated fertilizer salts in the medium cause root burn and nutrient lockout. White crust visible on soil.',
    treatment: 'Flush with 3x pot volume of plain pH\'d water. Reduce nutrient concentration. Use enzymes to break down salts.',
  },
  {
    issue: 'Root Bound',
    type: 'stress',
    symptoms: ['slow growth', 'wilting quickly', 'frequent watering needed', 'roots circling pot', 'yellowing leaves', 'stunted growth', 'drooping despite water', 'roots visible drainage holes', 'nutrient deficiency'],
    description: 'Root-bound plants have circling roots that can\'t access enough water or nutrients. Growth stalls.',
    treatment: 'Transplant to larger pot. Gently loosen root ball. Trim circling roots if severe. Water with transplant solution.',
  },
  // =============================================
  // GENETIC / GROWING ISSUES
  // =============================================
  {
    issue: 'Hermaphroditism',
    type: 'stress',
    symptoms: ['bananas', 'nanners', 'pollen sacs', 'male flowers female plant', 'stress balls', 'yellow bananas in buds', 'seed production', 'male parts on female'],
    description: 'Hermaphroditism produces male flowers (bananas/nanners) on female plants. Caused by stress or genetics.',
    treatment: 'Remove male flowers carefully if caught early. If widespread, harvest immediately to prevent seeding. Reduce stress sources.',
  },
  {
    issue: 'Revegging',
    type: 'stress',
    symptoms: ['new white pistils', 'single blade leaves', 'stretching in flower', 'confused growth', 'round leaves', 'elongated internodes', 'reverting to vegetative', 'abnormal leaf shape'],
    description: 'Revegging occurs when flowering plants receive light during dark period. New growth has abnormal single-blade leaves.',
    treatment: 'Fix light schedule immediately. Seal all light leaks. Maintain strict 12/12. Remove affected growth if minor.',
  },
  {
    issue: 'Foxtailing',
    type: 'stress',
    symptoms: ['new growth on buds', 'elongated buds', 'spiky buds', 'new pistils forming', 'abnormal bud growth', 'stacking calyxes', 'heat foxtailing', 'genetic foxtailing'],
    description: 'Foxtailing is new growth forming on mature buds. Can be genetic (sativas) or stress-induced (heat/light).',
    treatment: 'If stress-induced: lower temperature, raise lights. If genetic: normal for the strain. Monitor for hermies on foxtails.',
  },
  {
    issue: 'Bud Structure Issues (Airy/Loose Buds)',
    type: 'stress',
    symptoms: ['airy buds', 'loose buds', 'fluffy buds', 'poor density', 'small buds', 'larfy buds', 'popcorn buds', 'poor bud development'],
    description: 'Airy buds can result from excess nitrogen in flower, insufficient light, high temperatures, or genetic factors.',
    treatment: 'Reduce nitrogen in flower. Increase light intensity. Lower temperature in late flower. Choose denser genetics.',
  },
  {
    issue: 'Nutrient Lockout (General)',
    type: 'stress',
    symptoms: ['multiple deficiencies', 'slow growth', 'yellowing leaves', 'brown spots', 'stunted growth', 'plant not responding to feeding', 'nutrients not working', 'EC stable but plant declining'],
    description: 'Nutrient lockout occurs when pH or salt levels prevent nutrient uptake despite nutrients being present in the medium.',
    treatment: 'Flush with plain pH\'d water. Check and correct pH. Test runoff EC. Resume feeding at reduced strength.',
  },
  {
    issue: 'Light Leak Stress',
    type: 'stress',
    symptoms: ['hermaphrodite', 'nanners', 'reduced potency', 'stress seeds', 'confused flowering', 'new pistils late flower', 'bud structure issues', 'poor trichome development'],
    description: 'Small light leaks during dark period stress flowering plants. Can trigger hermies and reduce quality.',
    treatment: 'Check grow space for light leaks during dark period. Use green light for inspection (plants don\'t respond to green). Seal all gaps.',
  },
  {
    issue: 'Calcium Magnesium Imbalance',
    type: 'stress',
    symptoms: ['interveinal chlorosis', 'brown spots', 'purple stems', 'weak stems', 'magnesium deficiency', 'calcium deficiency', 'lockout symptoms', 'cal mag issues'],
    description: 'Ca:Mg ratio imbalance (especially in coco/hydro) causes lockout of both nutrients. Common with soft/RO water.',
    treatment: 'Add Cal-Mag supplement at proper ratio. Test water source. Coco needs 2-3ml/L Cal-Mag from start.',
  },
  {
    issue: 'Vapor Pressure Deficit Stress',
    type: 'stress',
    symptoms: ['leaf curling', 'slow growth', 'wilting', 'stomata closed', 'nutrient transport issues', 'tip burn', 'drooping', 'poor transpiration', 'edema', 'guttation'],
    description: 'Incorrect VPD (too high or too low) impairs transpiration. Low VPD = slow nutrient transport. High VPD = excessive water loss.',
    treatment: 'Calculate VPD for growth stage. Adjust temperature and humidity to achieve optimal range. Seedlings: 0.4-0.8, Flower: 1.0-1.5 kPa.',
  },
  {
    issue: 'Chlorine Toxicity',
    type: 'toxicity',
    symptoms: ['burnt leaf tips', 'bronze leaves', 'wilting', 'stunted growth', 'yellowing leaves', 'root damage', 'leaf scorch'],
    description: 'Chlorine in tap water at high levels causes leaf tip burn and root damage.',
    treatment: 'Let water sit 24 hours to off-gas chlorine. Use carbon filter. Rain water or RO water as alternative.',
  },
  {
    issue: 'Sodium Toxicity',
    type: 'toxicity',
    symptoms: ['burnt tips', 'yellowing leaves', 'salt damage', 'wilting', 'stunted growth', 'white salt deposits', 'root damage', 'leaf margin burn'],
    description: 'Sodium buildup (from water or nutrients) causes salt stress and locks out potassium and calcium.',
    treatment: 'Flush thoroughly with clean water. Use RO water. Check water source for sodium content.',
  },
  {
    issue: 'Boron Toxicity',
    type: 'toxicity',
    symptoms: ['burnt leaf tips', 'yellow leaf edges', 'necrotic spots', 'interveinal necrosis', 'leaf margin burn', 'older leaf damage'],
    description: 'Boron excess causes tip and edge burn on older leaves, progressing to interveinal necrosis.',
    treatment: 'Flush with plain water. Reduce boron supplementation. Check nutrient line boron content.',
  },
];

registerTool({
  name: 'match_symptoms',
  description:
    'Match observed plant symptoms against a database of known cannabis issues (deficiencies, pests, diseases, environmental stress). Returns ranked matches with confidence scores.',
  parameters: {
    symptoms: {
      type: 'string',
      description: 'Comma-separated list of observed symptoms (e.g., "yellowing leaves, brown spots, leaf curling")',
      required: true,
    },
  },
  execute: async (args) => {
    const raw = String(args.symptoms || '');
    const observed = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (observed.length === 0) {
      return JSON.stringify({ error: 'No symptoms provided' });
    }

    // Word stemmer for matching variations (yellowing ↔ yellow, leaves ↔ leaf)
    const stem = (word: string): string => {
      if (word.length < 4) return word;
      let w = word;
      if (w.endsWith('ing')) w = w.slice(0, -3);
      else if (w.endsWith('tion')) w = w.slice(0, -4);
      else if (w.endsWith('ness')) w = w.slice(0, -4);
      else if (w.endsWith('ment')) w = w.slice(0, -4);
      else if (w.endsWith('ally')) w = w.slice(0, -4);
      else if (w.endsWith('ily')) w = w.slice(0, -3);
      else if (w.endsWith('ly')) w = w.slice(0, -2);
      else if (w.endsWith('ed')) w = w.slice(0, -2);
      else if (w.endsWith('es')) w = w.slice(0, -2);
      else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
      // Handle common botanical synonyms
      if (w === 'leaf' || w === 'leave') w = 'leaf';
      if (w === 'stem' || w === 'stalk') w = 'stem';
      if (w === 'root' || w === 'radic') w = 'root';
      return w;
    };

    const matches: SymptomMatch[] = SYMPTOM_DB.map((entry) => {
      const matched = entry.symptoms.filter((s) =>
        observed.some((o) => {
          // Exact substring match
          if (s.includes(o) || o.includes(s)) return true;
          // Word-level stem matching (yellowing ↔ yellow, leaves ↔ leaf)
          const oWords = o.split(/\s+/);
          const sWords = s.split(/\s+/);
          return oWords.some((ow) => sWords.some((sw) => stem(ow) === stem(sw)));
        })
      );
      const missing = entry.symptoms.filter(
        (s) => !observed.some((o) => {
          if (s.includes(o) || o.includes(s)) return true;
          const oWords = o.split(/\s+/);
          const sWords = s.split(/\s+/);
          return oWords.some((ow) => sWords.some((sw) => stem(ow) === stem(sw)));
        })
      );
      // Blend percentage match with absolute match count to avoid penalizing
      // issues with more known symptoms (e.g. Nitrogen Deficiency has many possible symptoms)
      const percentScore = Math.round((matched.length / entry.symptoms.length) * 100);
      const absoluteBonus = Math.min(matched.length * 10, 30); // up to 30 bonus points
      const matchScore = Math.min(percentScore + absoluteBonus, 100);
      return {
        issue: entry.issue,
        type: entry.type,
        matchScore,
        matchedSymptoms: matched,
        missingSymptoms: missing,
        description: entry.description,
        treatment: entry.treatment,
      };
    })
      .filter((m) => m.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore);

    return JSON.stringify({ observed_symptoms: observed, top_matches: matches.slice(0, 5), total_matches: matches.length });
  },
});

// ============================================
// Tool: check_lockout
// ============================================

registerTool({
  name: 'check_lockout',
  description:
    'Check for nutrient lockout conditions. Given pH, medium, and symptoms, identifies which nutrients are likely locked out (unavailable to the plant).',
  parameters: {
    ph_level: { type: 'number', description: 'Current pH level', required: true },
    medium: { type: 'string', description: 'Growing medium: soil, coco, hydro', required: false },
    symptoms: {
      type: 'string',
      description: 'Comma-separated symptoms suggesting lockout',
      required: false,
    },
  },
  execute: async (args) => {
    const ph = Number(args.ph_level);
    const medium = String(args.medium || 'soil').toLowerCase();

    // pH availability ranges
    const nutrients: Array<{ name: string; available: [number, number]; deficiency_below: string; deficiency_above: string }> = [
      { name: 'Nitrogen (N)', available: [6.0, 8.0], deficiency_below: 'N becomes unavailable below 6.0 — yellowing lower leaves', deficiency_above: 'Excess N above 8.0 — dark, clawed leaves' },
      { name: 'Phosphorus (P)', available: [6.0, 7.5], deficiency_below: 'P locked out below 6.0 — purple stems, dark leaves', deficiency_above: 'P excess rare above 7.5' },
      { name: 'Potassium (K)', available: [6.0, 8.0], deficiency_below: 'K locked out below 6.0 — burnt leaf edges', deficiency_above: 'K excess rare' },
      { name: 'Calcium (Ca)', available: [6.2, 7.5], deficiency_below: 'Ca locked out below 6.2 — brown spots on new growth', deficiency_above: 'Ca excess above 7.5 — locks out other nutrients' },
      { name: 'Magnesium (Mg)', available: [6.2, 7.5], deficiency_below: 'Mg locked out below 6.2 — interveinal chlorosis', deficiency_above: 'Mg excess above 7.5' },
      { name: 'Iron (Fe)', available: [5.5, 6.5], deficiency_below: 'Fe locked out below 5.5 — yellowing new growth', deficiency_above: 'Fe locked out above 6.5 — young leaves yellow' },
      { name: 'Manganese (Mn)', available: [5.5, 6.5], deficiency_below: 'Mn deficiency below 5.5', deficiency_above: 'Mn locked out above 6.5 — interveinal chlorosis on young leaves' },
      { name: 'Zinc (Zn)', available: [5.5, 7.0], deficiency_below: 'Zn deficiency below 5.5', deficiency_above: 'Zn locked out above 7.0 — small, distorted leaves' },
      { name: 'Copper (Cu)', available: [5.5, 7.0], deficiency_below: 'Cu deficiency below 5.5', deficiency_above: 'Cu locked out above 7.0' },
      { name: 'Boron (B)', available: [5.5, 7.0], deficiency_below: 'B deficiency below 5.5 — distorted growing tips', deficiency_above: 'B locked out above 7.0' },
    ];

    // Adjust ranges for coco/hydro (slightly lower optimal pH)
    if (medium === 'coco' || medium === 'hydro') {
      nutrients.forEach((n) => {
        n.available = [Math.max(n.available[0] - 0.5, 4.5), Math.max(n.available[1] - 0.5, 6.0)];
      });
    }

    const lockedOut = nutrients
      .filter((n) => ph < n.available[0] || ph > n.available[1])
      .map((n) => ({
        nutrient: n.name,
        available_range: `${n.available[0]}–${n.available[1]}`,
        current_ph: ph,
        issue: ph < n.available[0] ? n.deficiency_below : n.deficiency_above,
        severity: Math.abs(ph - (ph < n.available[0] ? n.available[0] : n.available[1])) > 1 ? 'critical' : 'moderate',
      }));

    return JSON.stringify({
      ph_level: ph,
      medium,
      locked_out_nutrients: lockedOut,
      count: lockedOut.length,
      recommendation:
        lockedOut.length > 0
          ? `Adjust pH to ${(medium === 'coco' || medium === 'hydro' ? '5.8' : '6.5')} using pH up/down solution. Flush with properly pH'd water first.`
          : 'pH is within acceptable range for all major nutrients.',
    });
  },
});

// ============================================
// Tool: growth_stage_check
// ============================================

registerTool({
  name: 'growth_stage_check',
  description:
    'Validate growth stage information and return expected characteristics, common issues for that stage, and what to watch for.',
  parameters: {
    growth_stage: { type: 'string', description: 'The reported growth stage', required: true },
    days_in_stage: { type: 'number', description: 'How many days the plant has been in this stage', required: false },
  },
  execute: async (args) => {
    const stage = String(args.growth_stage || '').toLowerCase();
    const days = args.days_in_stage !== undefined ? Number(args.days_in_stage) : null;

    const stages: Record<string, {
      typical_duration: string;
      expected_height: string;
      key_characteristics: string[];
      common_issues: string[];
      watch_for: string[];
      nutrients_focus: string;
    }> = {
      seedling: {
        typical_duration: '1-3 weeks',
        expected_height: '5-15 cm',
        key_characteristics: ['Round cotyledon leaves', 'First serrated true leaves', 'Delicate root system', 'High humidity needs'],
        common_issues: ['Damping off', 'Overwatering', 'Light burn', 'Stretching from insufficient light'],
        watch_for: ['Stem stretching (lower light)', 'Curling from overwatering', 'White tips from light burn'],
        nutrients_focus: 'Minimal — rely on seed nutrients or very light feed (200-400 EC)',
      },
      vegetative: {
        typical_duration: '3-8 weeks',
        expected_height: '30-120 cm',
        key_characteristics: ['Rapid vertical growth', 'New node development every 2-3 days', 'Bushy canopy formation', 'Strong root expansion'],
        common_issues: ['Nitrogen deficiency', 'Overwatering', 'Pest introduction', 'PH drift'],
        watch_for: ['Yellowing lower leaves (N deficiency)', 'Stretched nodes (insufficient light)', 'Pests on undersides of leaves'],
        nutrients_focus: 'High nitrogen (N), moderate P-K. 400-800 EC seedlings, 800-1400 EC mature veg.',
      },
      'pre-flower': {
        typical_duration: '1-2 weeks',
        expected_height: 'Variable',
        key_characteristics: ['Sex determination (pistils/stigmas visible)', 'Stretch begins', 'Pre-flower formation at nodes', 'Growth rate increases'],
        common_issues: ['Hermaphrodite detection', 'Early pest issues', 'Light schedule disruption'],
        watch_for: ['Bananas/nanners (hermaphrodite)', 'Male pollen sacs', 'Rapid height increase'],
        nutrients_focus: 'Transition to bloom nutrients. Reduce N, increase P-K.',
      },
      flowering: {
        typical_duration: '7-10 weeks (strain dependent)',
        expected_height: 'Variable — most growth in first 3 weeks',
        key_characteristics: ['Pistil/calyx development', 'Resin production begins', 'Bud stacking', 'Aroma intensifies'],
        common_issues: ['Bud rot', 'Powdery mildew', 'Calcium deficiency', 'Potassium deficiency', 'Light burn on colas'],
        watch_for: ['Brown inner buds (botrytis)', 'White powder (PM)', 'Burnt leaf tips (nutrient burn)', 'Fox-tailing (heat/light stress)'],
        nutrients_focus: 'High P-K, low N. Bloom-specific nutrients. 1000-1600 EC.',
      },
      'late-flower': {
        typical_duration: '2-3 weeks',
        expected_height: 'Final size',
        key_characteristics: ['Trichome development (clear→cloudy→amber)', 'Pistils darkening and receding', 'Bud density increasing', 'Fade beginning (natural senescence'],
        common_issues: ['Bud rot (critical risk)', 'Trichome misread for harvest timing', 'Overfeeding causing harsh taste'],
        watch_for: ['Amber trichomes (approaching harvest)', 'Brown pistils (70-90% = harvest ready)', 'Inner bud mold'],
        nutrients_focus: 'Reduce feeding. Begin flush if using synthetic nutrients.',
      },
      'harvest-ready': {
        typical_duration: 'Harvest window: 3-7 days',
        expected_height: 'N/A',
        key_characteristics: ['70-90% brown pistils', 'Cloudy trichomes with some amber', 'Buds feel dense and firm', 'Aroma at peak'],
        common_issues: ['Harvesting too early/late', 'Bud rot during extended harvest window'],
        watch_for: ['Trichome color: mostly cloudy, 10-20% amber for peak THC', 'All cloudy = maximum potency', 'Amber = more CBN, sedative'],
        nutrients_focus: 'Flush with plain pH\'d water for 1-2 weeks before harvest.',
      },
    };

    const info = stages[stage];
    if (!info) {
      return JSON.stringify({ error: `Unknown growth stage: "${stage}". Valid: ${Object.keys(stages).join(', ')}` });
    }

    let timingNote = '';
    if (days !== null) {
      const [minWeeks, maxWeeks] = info.typical_duration.match(/(\d+)-(\d+)/)?.map(Number) || [0, 0];
      const minDays = minWeeks * 7;
      const maxDays = maxWeeks * 7;
      if (days > maxDays) {
        timingNote = `Plant has been in ${stage} for ${days} days — longer than the typical ${info.typical_duration}. Consider if transition conditions are correct.`;
      } else if (days < minDays) {
        timingNote = `Plant has been in ${stage} for ${days} days — still early in this stage.`;
      } else {
        timingNote = `Plant is ${days} days into ${stage} — within normal range of ${info.typical_duration}.`;
      }
    }

    return JSON.stringify({ stage, ...info, timing_note: timingNote });
  },
});

// ============================================
// Tool: generate_diagnosis
// ============================================

registerTool({
  name: 'generate_diagnosis',
  description:
    'Generate a structured diagnosis from collected evidence. Call this when you have enough information to provide a comprehensive analysis. This tool finalizes the agent session.',
  parameters: {
    diagnosis: { type: 'string', description: 'Primary diagnosis', required: true },
    confidence: { type: 'number', description: 'Confidence 0-100', required: true },
    urgency: { type: 'string', description: 'low/medium/high/critical', required: true },
    evidence_summary: { type: 'string', description: 'Key evidence supporting diagnosis', required: true },
    likely_causes: { type: 'string', description: 'JSON array of likely causes with confidence', required: true },
    recommendations: { type: 'string', description: 'JSON object with immediate/shortTerm/longTerm arrays', required: true },
    detected_issues: { type: 'string', description: 'JSON array of detected issues', required: true },
    prognosis: { type: 'string', description: 'Expected outcome', required: true },
    follow_up: { type: 'string', description: 'When to re-check', required: false },
    uncertainties: { type: 'string', description: 'JSON array of uncertainties/limitations', required: false },
  },
  execute: async (args) => {
    // Parse JSON string arguments safely
    const parseJsonArg = (val: unknown, fallback: unknown) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return fallback; }
      }
      return val || fallback;
    };

    const diagnosisResult = {
      status: 'diagnosis_complete',
      diagnosis: String(args.diagnosis || 'Unknown issue'),
      summary: String(args.evidence_summary || ''),
      confidence: Number(args.confidence) || 50,
      urgency: String(args.urgency || 'medium'),
      urgencyReasons: [] as string[],
      healthScore: Math.max(0, Math.min(100, 100 - (Number(args.confidence) || 50) * 0.3)),
      healthScoreBreakdown: {
        vigor: { score: 50, rationale: 'Estimated from available data' },
        leafCondition: { score: 50, rationale: 'Estimated from available data' },
        pestFree: { score: 70, rationale: 'No pest evidence' },
        environmentOptimal: { score: 60, rationale: 'Estimated from available data' },
        growthStageAppropriate: { score: 60, rationale: 'Estimated from available data' },
        rootHealth: { score: 60, rationale: 'Estimated from available data' },
      },
      likelyCauses: parseJsonArg(args.likely_causes, []),
      evidenceObservations: [String(args.evidence_summary || '')].filter(Boolean),
      uncertainties: parseJsonArg(args.uncertainties, ['Limited tool evidence gathered']),
      recommendations: parseJsonArg(args.recommendations, { immediate: [], shortTerm: [], longTerm: [] }),
      detectedIssues: parseJsonArg(args.detected_issues, []),
      prognosis: String(args.prognosis || ''),
      followUpSchedule: String(args.follow_up || 'Re-check in 3-5 days'),
    };

    return JSON.stringify(diagnosisResult);
  },
});

// ============================================
// Tool: request_more_info
// ============================================

registerTool({
  name: 'request_more_info',
  description:
    'Request additional information from the user before making a diagnosis. Use this when current information is insufficient for a confident diagnosis.',
  parameters: {
    reason: { type: 'string', description: 'Why more info is needed', required: true },
    questions: { type: 'string', description: 'JSON array of specific questions to ask', required: true },
    what_to_observe: {
      type: 'string',
      description: 'JSON array of specific things the user should photograph or measure',
      required: false,
    },
  },
  execute: async (args) => {
    const parseJsonSafe = (val: unknown, fallback: unknown[]) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return fallback; }
      }
      return Array.isArray(val) ? val : fallback;
    };

    return JSON.stringify({
      status: 'needs_more_info',
      reason: args.reason,
      questions: parseJsonSafe(args.questions, [String(args.reason || 'I need more information.')]),
      what_to_observe: parseJsonSafe(args.what_to_observe, []),
    });
  },
});

// ============================================
// Tool: calculate_feed_schedule
// ============================================

registerTool({
  name: 'calculate_feed_schedule',
  description:
    'Generate a nutrient feeding schedule based on growth stage, medium, and week in flowering. Returns N-P-K ratios, EC targets, and supplement recommendations.',
  parameters: {
    growth_stage: { type: 'string', description: 'Current growth stage', required: true },
    medium: { type: 'string', description: 'Growing medium: soil, coco, hydro', required: true },
    week_in_flower: { type: 'number', description: 'Week number if in flowering stage', required: false },
    is_organic: { type: 'string', description: '"true" if using organic nutrients', required: false },
  },
  execute: async (args) => {
    const stage = String(args.growth_stage || 'vegetative').toLowerCase();
    const medium = String(args.medium || 'soil').toLowerCase();
    const week = args.week_in_flower ? Number(args.week_in_flower) : null;
    const organic = String(args.is_organic || 'false') === 'true';

    const schedules: Record<string, {
      npk: string;
      ec: string;
      ph: string;
      supplements: string[];
      notes: string[];
    }> = {
      seedling: {
        npk: '1-1-1 (balanced, very dilute)',
        ec: '200-400',
        ph: medium === 'coco' || medium === 'hydro' ? '5.5-6.0' : '6.0-6.5',
        supplements: ['Root inoculant (mycorrhizae)', 'Humic/fulvic acid'],
        notes: ['Use 1/4 strength of veg nutrients', 'Plain pH\'d water most feedings', 'Watch for tip burn — seedlings are sensitive'],
      },
      vegetative: {
        npk: '3-1-2 (high nitrogen)',
        ec: '800-1400',
        ph: medium === 'coco' || medium === 'hydro' ? '5.5-6.0' : '6.0-6.8',
        supplements: ['Cal-Mag (especially in coco/hydro)', 'Silica (strengthens cell walls)', 'Kelp/seaweed (micronutrients)'],
        notes: ['Increase EC gradually as plant matures', organic ? 'Top-dress with compost every 2 weeks' : 'Feed every other watering in soil', 'Run-off EC should stay below input EC + 300'],
      },
      'pre-flower': {
        npk: '2-2-3 (transitioning)',
        ec: '1000-1400',
        ph: medium === 'coco' || medium === 'hydro' ? '5.5-6.0' : '6.0-6.5',
        supplements: ['Begin bloom booster', 'Continue Cal-Mag', 'Reduce silica by 50%'],
        notes: ['Transition N to P-K focus', 'Watch for stretch — indicates need for more P-K', 'This is the last chance to correct deficiencies before flower'],
      },
      flowering: {
        npk: week && week <= 3 ? '1-3-4 (early bloom)' : week && week <= 6 ? '0-4-5 (mid bloom)' : '0-3-4 (late bloom)',
        ec: week && week <= 3 ? '1200-1600' : week && week <= 6 ? '1400-1800' : '1000-1400',
        ph: medium === 'coco' || medium === 'hydro' ? '5.8-6.2' : '6.0-6.5',
        supplements: [
          week && week <= 4 ? 'Bloom booster (P-K heavy)' : 'Reduce bloom booster',
          'Cal-Mag through week 5-6',
          week && week >= 5 ? 'Carbo-loading (molasses, carbs)' : '',
          week && week >= 6 ? 'Ripening supplement (PK 0-13-14 style)' : '',
        ].filter(Boolean),
        notes: [
          organic ? 'Top-dress with bloom amendments weekly' : 'Monitor EC closely — bloom nutes can spike salts',
          'Reduce N progressively — excess N in flower causes airy buds',
          week && week >= 4 ? 'Begin flush planning if using synthetics' : '',
          'Check trichomes from week 6+',
        ].filter(Boolean),
      },
      'late-flower': {
        npk: '0-2-3 (minimal)',
        ec: '600-1000 (tapering)',
        ph: medium === 'coco' || medium === 'hydro' ? '5.8-6.2' : '6.0-6.5',
        supplements: ['Plain pH\'d water for flush (1-2 weeks)', 'Enzyme supplement (breaks down salts)'],
        notes: ['Reduce feeding dramatically', 'Flush with 3x pot volume of plain water', 'Fan leaves will yellow — this is natural senescence', 'Monitor trichomes daily for harvest window'],
      },
      'harvest-ready': {
        npk: '0-0-0 (plain water only)',
        ec: '0-200',
        ph: medium === 'coco' || medium === 'hydro' ? '5.8-6.2' : '6.0-6.5',
        supplements: [],
        notes: ['Pure water flush until harvest', 'No nutrients — improves taste and burn quality'],
      },
    };

    const schedule = schedules[stage] || schedules['vegetative'];
    const mediumNotes: Record<string, string> = {
      soil: 'Water when top inch is dry. Soil buffers pH naturally.',
      coco: 'Never let coco dry out completely. Feed every watering. Coco needs Cal-Mag.',
      hydro: 'Change reservoir weekly. Monitor EC and pH daily. Roots need oxygen.',
    };

    return JSON.stringify({
      growth_stage: stage,
      medium,
      week_in_flower: week,
      is_organic: organic,
      ...schedule,
      medium_note: mediumNotes[medium] || mediumNotes['soil'],
      water_schedule: medium === 'soil' ? 'Every 2-3 days (dry-back method)' : 'Daily (coco/hydro stays moist)',
    });
  },
});

// ============================================
// Tool: assess_trichome_harvest
// ============================================

registerTool({
  name: 'assess_trichome_harvest',
  description:
    'Analyze trichome maturity data to determine optimal harvest window. Takes trichome color observations and returns harvest timing recommendation with expected effects.',
  parameters: {
    clear_pct: { type: 'number', description: 'Percentage of clear/glassy trichomes (0-100)', required: true },
    cloudy_pct: { type: 'number', description: 'Percentage of cloudy/milky trichomes (0-100)', required: true },
    amber_pct: { type: 'number', description: 'Percentage of amber/brown trichomes (0-100)', required: true },
    strain_type: { type: 'string', description: 'Strain type: indica, sativa, hybrid', required: false },
    desired_effect: { type: 'string', description: 'Desired effect: energetic, balanced, sedative', required: false },
  },
  execute: async (args) => {
    const clear = Number(args.clear_pct || 0);
    const cloudy = Number(args.cloudy_pct || 0);
    const amber = Number(args.amber_pct || 0);
    const total = clear + cloudy + amber;
    const strainType = String(args.strain_type || 'hybrid').toLowerCase();
    const desired = String(args.desired_effect || 'balanced').toLowerCase();

    if (total < 90 || total > 110) {
      return JSON.stringify({
        error: `Trichome percentages should add up to ~100% (got ${total}%). Please re-check your observations.`,
      });
    }

    let harvestStatus: string;
    let daysEstimate: string;
    let thcEffect: string;
    let recommendation: string;

    if (clear > 50) {
      harvestStatus = 'too_early';
      daysEstimate = '7-14 days more';
      thcEffect = 'THC still developing — low potency, energetic but weak';
      recommendation = 'Wait. Trichomes need to transition to cloudy. Check again in 3-4 days.';
    } else if (cloudy >= 70 && amber < 15) {
      harvestStatus = 'peak_thc';
      daysEstimate = '0-5 days';
      thcEffect = 'Maximum THC, minimal CBN — energetic, cerebral, potent';
      recommendation = desired === 'energetic' ? 'Harvest now for peak cerebral effect.' : 'Wait 2-3 more days for slightly more body effect.';
    } else if (cloudy >= 50 && amber >= 10 && amber <= 30) {
      harvestStatus = 'optimal_balanced';
      daysEstimate = '0-3 days';
      thcEffect = 'High THC with some CBN — balanced high, both cerebral and body';
      recommendation = 'Ideal harvest window for most users. ' + (desired === 'balanced' ? 'Perfect timing for your goal.' : '');
    } else if (amber > 30) {
      harvestStatus = 'late';
      daysEstimate = 'Harvest immediately';
      thcEffect = 'THC degrading to CBN — sedative, couch-lock, narcotic';
      recommendation = desired === 'sedative' ? 'Harvest now — heavy body effect as desired.' : 'Harvest ASAP — THC is degrading. Effects will be more sedative than balanced.';
    } else {
      harvestStatus = 'approaching';
      daysEstimate = '3-7 days';
      thcEffect = 'Transitioning — potency increasing, beginning to balance';
      recommendation = 'Getting close. Monitor every 2-3 days. ' + (strainType === 'sativa' ? 'Sativas benefit from slightly earlier harvest.' : strainType === 'indica' ? 'Indicas can go slightly later for couch-lock.' : '');
    }

    const strainAdvice: Record<string, string> = {
      indica: 'Indica-dominant strains: harvesting at 20-30% amber maximizes the heavy body effect they\'re known for.',
      sativa: 'Sativa-dominant strains: harvesting at 10-20% amber preserves the energetic cerebral high.',
      hybrid: 'Hybrid strains: 15-25% amber is the sweet spot for balanced effects.',
    };

    return JSON.stringify({
      trichome_breakdown: { clear: `${clear}%`, cloudy: `${cloudy}%`, amber: `${amber}%` },
      harvest_status: harvestStatus,
      days_estimate: daysEstimate,
      thc_effect: thcEffect,
      recommendation,
      strain_advice: strainAdvice[strainType] || strainAdvice['hybrid'],
      ideal_window: desired === 'energetic' ? '80-90% cloudy, <10% amber' : desired === 'sedative' ? '50-60% cloudy, 30-40% amber' : '70-80% cloudy, 15-25% amber',
    });
  },
});

// ============================================
// Tool: calculate_vpd
// ============================================

registerTool({
  name: 'calculate_vpd',
  description:
    'Calculate Vapor Pressure Deficit (VPD) with detailed analysis. Returns VPD value, optimal range for growth stage, and specific adjustment recommendations for temperature and humidity. Accept temperature in Celsius (temperature_c) or Fahrenheit (temperature_f).',
  parameters: {
    temperature_c: { type: 'number', description: 'Leaf or air temperature in Celsius', required: false },
    temperature_f: { type: 'number', description: 'Leaf or air temperature in Fahrenheit (converted to Celsius internally)', required: false },
    humidity_pct: { type: 'number', description: 'Relative humidity percentage', required: true },
    growth_stage: { type: 'string', description: 'Current growth stage', required: true },
    leaf_temp_offset: { type: 'number', description: 'Leaf temp offset in °C (default 2). If using Fahrenheit, this is still in °C internally.', required: false },
  },
  execute: async (args) => {
    // Convert Fahrenheit to Celsius if needed
    let tempC: number;
    const useF = args.temperature_f !== undefined && args.temperature_c === undefined;
    if (useF) {
      tempC = Math.round(((Number(args.temperature_f) - 32) * 5) / 9 * 10) / 10;
    } else {
      tempC = Number(args.temperature_c);
    }
    const temp = tempC;
    const hum = Number(args.humidity_pct);
    const stage = String(args.growth_stage || 'vegetative').toLowerCase();
    const leafOffset = args.leaf_temp_offset !== undefined ? Number(args.leaf_temp_offset) : 2;
    const leafTemp = temp - leafOffset;

    // Saturation vapor pressure (Tetens formula)
    const satVP = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
    const airVP = satVP(temp);
    const leafVP = satVP(leafTemp);
    const actualVP = airVP * (hum / 100);
    const vpd = leafVP - actualVP;

    // Optimal VPD ranges by stage
    const ranges: Record<string, { min: number; max: number; ideal: number }> = {
      seedling: { min: 0.4, max: 0.8, ideal: 0.6 },
      vegetative: { min: 0.8, max: 1.2, ideal: 1.0 },
      'pre-flower': { min: 0.8, max: 1.2, ideal: 1.0 },
      flowering: { min: 1.0, max: 1.5, ideal: 1.2 },
      'late-flower': { min: 1.0, max: 1.4, ideal: 1.2 },
      'harvest-ready': { min: 0.8, max: 1.2, ideal: 1.0 },
    };

    const range = ranges[stage] || ranges['vegetative'];
    const status = vpd >= range.min && vpd <= range.max ? 'optimal' :
      vpd >= range.min - 0.2 && vpd <= range.max + 0.2 ? 'warning' : 'critical';

    // Specific adjustments
    const adjustments: string[] = [];
    if (vpd < range.min) {
      const deficit = range.ideal - vpd;
      adjustments.push(`VPD is ${deficit.toFixed(2)} kPa too low — transpiration will be slow.`);
      adjustments.push('Options to increase VPD:');
      adjustments.push(`  → Raise temp by ${Math.ceil(deficit * 3)}°C (to ${temp + Math.ceil(deficit * 3)}°C), OR`);
      adjustments.push(`  → Lower humidity by ${Math.round(deficit * 15)}% (to ${Math.max(30, hum - Math.round(deficit * 15))}%)`);
      adjustments.push('Risk: Low VPD causes slow nutrient transport, guttation, mold/botrytis in flower.');
    } else if (vpd > range.max) {
      const excess = vpd - range.ideal;
      adjustments.push(`VPD is ${excess.toFixed(2)} kPa too high — transpiration is excessive.`);
      adjustments.push('Options to decrease VPD:');
      adjustments.push(`  → Lower temp by ${Math.ceil(excess * 3)}°C (to ${temp - Math.ceil(excess * 3)}°C), OR`);
      adjustments.push(`  → Raise humidity by ${Math.round(excess * 15)}% (to ${Math.min(70, hum + Math.round(excess * 15))}%)`);
      adjustments.push('Risk: High VPD causes leaf curl, stomatal closure, nutrient burn, wilting.');
    } else {
      adjustments.push('VPD is in the optimal range for this growth stage. Transpiration and nutrient transport should be healthy.');
    }

    const displayAirTemp = useF ? Math.round(temp * 9 / 5 + 32) : temp;
    const displayLeafTemp = useF ? Math.round(leafTemp * 9 / 5 + 32) : Math.round(leafTemp * 10) / 10;
    const tempUnit = useF ? '°F' : '°C';

    return JSON.stringify({
      vpd: Math.round(vpd * 100) / 100,
      unit: 'kPa',
      air_temp: displayAirTemp,
      air_temp_unit: tempUnit,
      leaf_temp: displayLeafTemp,
      leaf_temp_unit: tempUnit,
      humidity: hum,
      growth_stage: stage,
      optimal_range: `${range.min}–${range.max} kPa`,
      ideal_value: range.ideal,
      status,
      adjustments,
      quick_fix: status !== 'optimal' ? (vpd < range.min ? 'Increase temp or decrease humidity' : 'Decrease temp or increase humidity') : 'No adjustment needed',
    });
  },
});

// ============================================
// Tool: get_deficiency_guide
// ============================================

registerTool({
  name: 'get_deficiency_guide',
  description:
    'Get a detailed diagnostic guide for a specific nutrient deficiency or toxicity. Includes visual symptoms, affected leaf positions, pH lockout ranges, and correction steps.',
  parameters: {
    nutrient: { type: 'string', description: 'Nutrient name: nitrogen, phosphorus, potassium, calcium, magnesium, iron, manganese, zinc, copper, boron, sulfur', required: true },
    condition: { type: 'string', description: '"deficiency" or "toxicity"', required: false },
  },
  execute: async (args) => {
    const nutrient = String(args.nutrient || '').toLowerCase();
    const condition = String(args.condition || 'deficiency').toLowerCase();

    const tu = loadTemperatureUnit();
    const fmtTemp = (s: string) => {
      if (tu !== 'F') return s;
      return s.replace(/(\d+)-(\d+)°C/g, (_, a, b) => `${celsiusToFahrenheit(Number(a))}-${celsiusToFahrenheit(Number(b))}°F`)
        .replace(/(\d+)°C/g, (_, a) => `${celsiusToFahrenheit(Number(a))}°F`);
    };

    const guides: Record<string, {
      deficiency: { symptoms: string[]; leaf_position: string; ph_lockout: string; causes: string[]; fix: string[] };
      toxicity: { symptoms: string[]; leaf_position: string; causes: string[]; fix: string[] };
    }> = {
      nitrogen: {
        deficiency: {
          symptoms: ['Overall yellowing starting from bottom leaves', 'Pale green → yellow progression upward', 'Stunted growth', 'Small, thin leaves', 'Premature leaf drop'],
          leaf_position: 'Bottom/older leaves first, progresses upward',
          ph_lockout: 'N is unavailable below pH 6.0',
          causes: ['Insufficient feeding', 'pH too low (locks out N)', 'Overwatering (root damage)', 'Poor soil biology'],
          fix: ['Add nitrogen source: fish emulsion, blood meal, calcium nitrate', 'Check and correct pH to 6.0-7.0', 'If organic: top-dress with composted manure', 'Foliar feed with dilute fish emulsion for quick absorption'],
        },
        toxicity: {
          symptoms: ['Very dark green leaves', 'Leaf clawing (tips curl down)', 'Thick, brittle stems', 'Delayed flowering', 'Burnt tips at high excess'],
          leaf_position: 'All leaves, newest growth most affected',
          causes: ['Overfeeding', 'Too much vegetative nutrients', 'Ammonium-heavy fertilizer'],
          fix: ['Flush with plain pH\'d water (3x pot volume)', 'Reduce N feed by 50%', 'Allow plant to use stored N before resuming'],
        },
      },
      phosphorus: {
        deficiency: {
          symptoms: ['Dark green leaves with purple/red stems', 'Purple/reddish discoloration on leaf undersides', 'Slow growth', 'Small, dense leaves', 'Poor root development'],
          leaf_position: 'Older/bottom leaves first',
          ph_lockout: 'P locked out below pH 6.0 and above 7.5',
          causes: ['pH too low', 'Cold temperatures (below 15°C)', 'Insufficient P in feed', 'Iron or zinc excess competing'],
          fix: ['Add bloom nutrients or bone meal', 'Correct pH to 6.2-7.0', 'Warm root zone to 20-25°C', 'Use phosphoric acid pH down (adds P)'],
        },
        toxicity: {
          symptoms: ['Nutrient lockout of zinc, iron, copper', 'Bronze/copper colored leaves', 'Stunted growth', 'Calcium deficiency signs'],
          leaf_position: 'New growth affected by secondary lockouts',
          causes: ['Excess bloom booster', 'Accumulated salts'],
          fix: ['Flush with plain water', 'Reduce P-K feeds', 'Check for zinc/iron deficiency'],
        },
      },
      potassium: {
        deficiency: {
          symptoms: ['Brown, crispy leaf edges and tips', 'Interveinal chlorosis on older leaves', 'Weak stems', 'Poor disease resistance', 'Small buds'],
          leaf_position: 'Older/lower leaves first, edges and tips',
          ph_lockout: 'K locked out below pH 6.0',
          causes: ['Insufficient K in feed', 'Salt buildup blocking uptake', 'Low pH', 'Excess calcium competing'],
          fix: ['Add potassium sulfate, kelp meal, or wood ash', 'Flush if salt buildup suspected', 'Correct pH to 6.0-7.0', 'Foliar spray with kelp extract'],
        },
        toxicity: {
          symptoms: ['Calcium and magnesium lockout', 'Salt burn at leaf tips', 'Crunchy leaf edges'],
          leaf_position: 'All leaves, tips and edges',
          causes: ['Overfeeding K', 'Accumulated salts'],
          fix: ['Flush with 3x volume plain water', 'Reduce K-heavy nutrients', 'Add Cal-Mag to restore balance'],
        },
      },
      calcium: {
        deficiency: {
          symptoms: ['Brown/copper spots on newer leaves', 'New growth twisted or distorted', 'Weak stems, poor cell walls', 'Root tip die-off', 'Blossom end rot in fruit'],
          leaf_position: 'New/upper growth first (Ca is immobile)',
          ph_lockout: 'Ca locked out below pH 6.2',
          causes: ['Low pH', 'Soft/RO water without Cal-Mag', 'Excess potassium blocking uptake', 'Low transpiration (high humidity, low airflow)'],
          fix: ['Add Cal-Mag supplement', 'Correct pH to 6.2-7.0', 'If using RO/soft water: add 2-3ml/L Cal-Mag', 'Improve airflow to increase transpiration'],
        },
        toxicity: {
          symptoms: ['Locks out magnesium and potassium', 'Mg deficiency signs appear', 'pH rises in root zone'],
          leaf_position: 'Mg/K deficiency symptoms on older leaves',
          causes: ['Excess lime or calcium supplement', 'Hard water with high Ca'],
          fix: ['Reduce calcium inputs', 'Flush to reset', 'Add Epsom salt to restore Mg'],
        },
      },
      magnesium: {
        deficiency: {
          symptoms: ['Interveinal chlorosis (yellow between green veins)', 'Leaves look marbled — green veins, yellow tissue', 'Brown spots developing', 'Leaf curling upward', 'Purple stems'],
          leaf_position: 'Older/lower leaves first (Mg is mobile)',
          ph_lockout: 'Mg locked out below pH 6.2',
          causes: ['Low pH', 'Excess calcium (Ca:Mg imbalance)', 'Light/heat stress increasing Mg demand', 'Soft water'],
          fix: ['Add Epsom salt: 1 tsp per gallon (5g/L)', 'Foliar spray with Epsom salt for fast absorption', 'Correct pH to 6.2-7.0', 'If using Cal-Mag, increase ratio of Mg'],
        },
        toxicity: {
          symptoms: ['Calcium lockout', 'Dark green leaves', 'Salty deposits on soil surface'],
          leaf_position: 'All leaves',
          causes: ['Excess Epsom salt', 'Over-supplementation'],
          fix: ['Flush with plain water', 'Reduce Epsom salt', 'Restore Ca:Mg balance'],
        },
      },
      iron: {
        deficiency: {
          symptoms: ['New/young leaves turn yellow while veins stay green', 'Chlorosis on newest growth', 'Eventually white/yellow new growth', 'Stunted top growth'],
          leaf_position: 'New/upper growth first (Fe is immobile)',
          ph_lockout: 'Fe locked out above pH 6.5 and below 5.5',
          causes: ['pH too high (most common)', 'Root damage', 'Excess manganese or copper competing', 'Overwatering'],
          fix: ['Lower pH to 5.8-6.2', 'Add chelated iron (Fe-DTPA or Fe-EDDHA)', 'Flush to clear lockout, then re-feed with correct pH', 'Check root health'],
        },
        toxicity: {
          symptoms: ['Bronze/dark coloring on leaves', 'Phosphorus lockout signs', 'Growth stunting'],
          leaf_position: 'All leaves',
          causes: ['pH too low', 'Excess iron supplement'],
          fix: ['Raise pH', 'Flush', 'Stop iron supplementation'],
        },
      },
    };

    const guide = guides[nutrient];
    if (!guide) {
      return JSON.stringify({
        error: `No guide available for "${nutrient}". Available: ${Object.keys(guides).join(', ')}`,
      });
    }

    const data = condition === 'toxicity' ? guide.toxicity : guide.deficiency;
    return JSON.stringify({
      nutrient: nutrient.charAt(0).toUpperCase() + nutrient.slice(1),
      condition,
      symptoms: data.symptoms.map(fmtTemp),
      leaf_position: data.leaf_position,
      ph_lockout: 'ph_lockout' in data ? fmtTemp((data as { ph_lockout: string }).ph_lockout) : undefined,
      causes: data.causes.map(fmtTemp),
      fix: data.fix.map(fmtTemp),
      temperature_unit: tu,
      mobile_nutrient: ['nitrogen', 'phosphorus', 'potassium', 'magnesium'].includes(nutrient),
      note: ['nitrogen', 'phosphorus', 'potassium', 'magnesium'].includes(nutrient)
        ? 'This is a mobile nutrient — deficiency shows on OLDER leaves first (plant moves it to new growth).'
        : 'This is an immobile nutrient — deficiency shows on NEW leaves first (plant cannot relocate it).',
    });
  },
});

// ============================================
// Tool: self_critique
// ============================================

registerTool({
  name: 'self_critique',
  description:
    'Review current evidence and hypothesis for contradictions, gaps, and alternative explanations. Use before finalizing a diagnosis to ensure quality. This is the agent\'s self-reflection mechanism.',
  parameters: {
    current_hypothesis: { type: 'string', description: 'Current leading diagnosis', required: true },
    evidence_for: { type: 'string', description: 'JSON array of evidence supporting the hypothesis', required: true },
    evidence_against: { type: 'string', description: 'JSON array of evidence contradicting the hypothesis', required: false },
    alternative_diagnoses: { type: 'string', description: 'JSON array of alternative explanations to consider', required: false },
  },
  execute: async (args) => {
    const hypothesis = String(args.current_hypothesis || '');
    const forEvidence = JSON.parse(String(args.evidence_for || '[]'));
    const againstEvidence = JSON.parse(String(args.evidence_against || '[]'));
    const alternatives = JSON.parse(String(args.alternative_diagnoses || '[]'));

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const gaps: string[] = [];

    // Analyze evidence balance
    if (forEvidence.length >= 3) {
      strengths.push(`Strong evidence base with ${forEvidence.length} supporting observations.`);
    } else if (forEvidence.length < 2) {
      weaknesses.push('Weak evidence base — fewer than 2 supporting observations. Confidence should be reduced.');
    }

    if (againstEvidence.length > forEvidence.length) {
      weaknesses.push('More evidence AGAINST the hypothesis than FOR it. Consider alternatives seriously.');
    }

    // Check for common misdiagnoses
    const commonConfusions: Record<string, string[]> = {
      'Nitrogen Deficiency': ['Magnesium Deficiency', 'Overwatering', 'Light Burn'],
      'Magnesium Deficiency': ['Iron Deficiency', 'Nitrogen Deficiency', 'Light Stress'],
      'Spider Mites': ['Thrips', 'Environmental Damage', 'Nutrient Burn'],
      'Overwatering': ['Root Rot', 'Nitrogen Deficiency', 'pH Issues'],
      'Heat Stress': ['Light Burn', 'Nutrient Burn', 'Calcium Deficiency'],
    };

    const confusedWith = commonConfusions[hypothesis] || [];
    if (confusedWith.length > 0 && alternatives.length === 0) {
      gaps.push(`This diagnosis is commonly confused with: ${confusedWith.join(', ')}. Have these been ruled out?`);
    }

    // Quality checks
    if (forEvidence.some((e: string) => e.toLowerCase().includes('image'))) {
      strengths.push('Visual evidence from image analysis supports the diagnosis.');
    } else {
      gaps.push('No image analysis — visual confirmation would increase confidence.');
    }

    const confidenceAdjustment = strengths.length - weaknesses.length;
    const adjustedConfidence = Math.max(20, Math.min(95, 60 + confidenceAdjustment * 10));

    return JSON.stringify({
      hypothesis,
      critique_summary: weaknesses.length === 0 ? 'Hypothesis is well-supported by evidence.' :
        weaknesses.length >= 2 ? 'Hypothesis has significant weaknesses — consider alternatives or gather more evidence.' :
          'Hypothesis is reasonable but has some gaps.',
      strengths,
      weaknesses,
      gaps,
      alternatives_to_consider: confusedWith,
      adjusted_confidence: adjustedConfidence,
      recommendation: weaknesses.length >= 2 ? 'Gather more evidence before finalizing diagnosis.' :
        gaps.length > 0 ? 'Address key gaps if possible, then proceed with diagnosis.' :
          'Hypothesis is solid — proceed to final diagnosis.',
    });
  },
});

// ============================================
// Tool: grow_schedule_advisor
// ============================================

registerTool({
  name: 'grow_schedule_advisor',
  description:
    'Generate a complete grow timeline from current stage to harvest. Includes key milestones, environmental targets, nutrient transitions, and warning signs to watch for at each stage.',
  parameters: {
    current_stage: { type: 'string', description: 'Current growth stage', required: true },
    strain_type: { type: 'string', description: 'indica, sativa, hybrid, or autoflower', required: false },
    flowering_week: { type: 'number', description: 'Current week in flowering (if applicable)', required: false },
    target_yield: { type: 'string', description: 'Yield goal: maximize, quality, speed', required: false },
  },
  execute: async (args) => {
    const stage = String(args.current_stage || 'vegetative').toLowerCase();
    const strainType = String(args.strain_type || 'hybrid').toLowerCase();
    const week = args.flowering_week ? Number(args.flowering_week) : null;
    const target = String(args.target_yield || 'quality').toLowerCase();

    // Check temperature unit preference
    const tempUnit = loadTemperatureUnit();
    const fmtEnv = (envStr: string) => {
      if (tempUnit !== 'F') return envStr;
      return envStr.replace(/(\d+)-(\d+)°C/g, (_, a, b) => `${celsiusToFahrenheit(Number(a))}-${celsiusToFahrenheit(Number(b))}°F`)
        .replace(/(\d+)°C/g, (_, a) => `${celsiusToFahrenheit(Number(a))}°F`);
    };

    const flowerDuration: Record<string, number> = {
      indica: 8,
      sativa: 10,
      hybrid: 9,
      autoflower: 10,
    };
    const totalWeeks = flowerDuration[strainType] || 9;

    const milestones: Array<{ stage: string; week: string; actions: string[]; warnings: string[]; env: string }> = [];

    if (stage === 'seedling') {
      milestones.push({
        stage: 'Seedling',
        week: 'Week 1-3',
        actions: ['Keep humidity dome on (70-80%)', 'Light misting, avoid overwatering', 'Light at 200-400 PPFD', 'Very light nutrients (200-400 EC)'],
        warnings: ['Damping off if too wet', 'Stretching if light too weak', 'Tip burn if nutrients too strong'],
        env: 'Temp: 22-25°C | RH: 70-80% | VPD: 0.4-0.8',
      });
    }
    if (['seedling', 'vegetative'].includes(stage)) {
      milestones.push({
        stage: 'Vegetative Growth',
        week: 'Week 3-8+',
        actions: ['Increase light to 400-600 PPFD', 'Train canopy (LST, topping, scrog)', 'Increase nutrients to 800-1400 EC', 'Transplant to final pot when rootbound'],
        warnings: ['N deficiency from rapid growth', 'Pest introduction (inspect weekly)', 'pH drift in reservoir/soil'],
        env: 'Temp: 22-28°C | RH: 50-70% | VPD: 0.8-1.2',
      });
    }
    if (['seedling', 'vegetative', 'pre-flower'].includes(stage)) {
      milestones.push({
        stage: 'Pre-Flower / Flip',
        week: 'Flip to 12/12',
        actions: ['Switch to 12/12 light schedule', 'Reduce N, increase P-K', 'Set up SCROG/net if needed', 'Remove males if regular seeds'],
        warnings: ['Hermaphrodite stress (check for nanners)', 'Stretch — plants can double in height', 'Light leaks cause hermies'],
        env: 'Temp: 22-26°C | RH: 45-55% | VPD: 0.8-1.2',
      });
    }

    const flowerWeeks = [];
    if (week !== null || ['pre-flower', 'flowering', 'late-flower'].includes(stage)) {
      const startWeek = week || 1;
      for (let w = startWeek; w <= totalWeeks; w++) {
        if (w <= 3) {
          flowerWeeks.push({
            stage: 'Early Flower',
            week: `Week ${w}/${totalWeeks}`,
            actions: ['Bloom nutrients ramping up', 'Support branches (bamboo, trellis)', 'Increase light to 600-900 PPFD', 'RH below 55% to prevent mold'],
            warnings: ['Bud sites need airflow', 'Calcium demand increases', 'Stretch continues'],
            env: 'Temp: 20-26°C | RH: 45-55% | VPD: 1.0-1.3',
          });
        } else if (w <= 6) {
          flowerWeeks.push({
            stage: 'Mid Flower',
            week: `Week ${w}/${totalWeeks}`,
            actions: ['Peak bloom nutrients', 'Defoliate lower growth', 'Carbs/supplements boost', 'Monitor trichomes from week 5+'],
            warnings: ['Bud rot risk increases', 'N burn if not reduced N', 'PM if humidity too high'],
            env: 'Temp: 20-25°C | RH: 40-50% | VPD: 1.1-1.4',
          });
        } else {
          flowerWeeks.push({
            stage: 'Late Flower / Ripening',
            week: `Week ${w}/${totalWeeks}`,
            actions: ['Reduce nutrients progressively', `Begin flush at week ${totalWeeks - 2}`, 'Check trichomes daily', 'Reduce light to 600-800 PPFD if foxtailing'],
            warnings: ['Bud rot — check dense colas daily', 'Over-ripening reduces quality', 'Harvest window is 5-7 days'],
            env: 'Temp: 18-24°C | RH: 35-45% | VPD: 1.0-1.3',
          });
        }
      }
    }

    milestones.push(...flowerWeeks);

    milestones.push({
      stage: 'Harvest',
      week: `~Week ${totalWeeks + 1}`,
      actions: ['Harvest when trichomes: 70-80% cloudy, 15-25% amber', 'Cut at base, trim fan leaves', 'Hang whole plant or branches', 'Dark room, 15-21°C, 50% RH, gentle airflow'],
      warnings: ['Don\'t handle buds too much (trichome loss)', 'No direct light on drying buds', 'Check for mold daily during dry'],
      env: 'Dry: 15-21°C | RH: 45-55% | 7-14 days',
    });

    milestones.push({
      stage: 'Cure',
      week: `Week ${totalWeeks + 3}+`,
      actions: ['Trim dried buds', 'Place in glass jars 75% full', 'Burp jars 2x/day for first week', 'Then 1x/day for week 2-3', 'Cure for minimum 2-4 weeks, ideal 6-8 weeks'],
      warnings: ['Mold if jars sealed too early (buds still moist)', 'Over-drying if burping too long', 'Check for ammonia smell (bad sign)'],
      env: 'Cure: 15-21°C | RH: 58-62% in jar',
    });

    return JSON.stringify({
      current_stage: stage,
      strain_type: strainType,
      flowering_duration: `${totalWeeks} weeks`,
      target,
      milestones: milestones.map((m) => ({ ...m, env: fmtEnv(m.env) })),
      total_estimated_weeks: totalWeeks + 6,
      temperature_unit: tempUnit,
      pro_tip: target === 'quality' ? 'Quality harvests come from patience — full flush, proper cure, don\'t rush.' :
        target === 'speed' ? 'Autoflowers or fast-finishing strains help. Don\'t skip flush though.' :
          'SCROG + proper defoliation maximizes yield per light watt.',
    });
  },
});

// ============================================
// Tool: web_search (Plant Doctor only)
// ============================================

registerTool({
  name: 'web_search',
  description:
    'Search the web for plant-related information such as disease identification, treatment research, strain-specific issues, nutrient deficiency references, and growing techniques. Only available when web search is enabled in settings.',
  parameters: {
    query: {
      type: 'string',
      description: 'Search query — be specific (e.g., "cannabis calcium deficiency treatment soil" or "botrytis bud rot early signs treatment")',
      required: true,
    },
  },
  execute: async (args) => {
    const config = loadWebSearchConfig();
    if (!config.enabled) {
      return JSON.stringify({
        error: 'Web search is disabled. Enable it in Settings > Plant Doctor to allow the agent to search for plant information online.',
      });
    }

    const query = String(args.query || '');
    if (!query.trim()) {
      return JSON.stringify({ error: 'No search query provided.' });
    }

    const results = await performWebSearch(query, config);
    return JSON.stringify({
      query,
      provider: config.provider,
      results: results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    });
  },
});

// ============================================
// Tool: consult_council
// Consult the expert council for multi-perspective analysis
// ============================================

registerTool({
  name: 'consult_council',
  description:
    'Consult the CannaAI expert council (8 specialists) for multi-perspective analysis on a complex question. Use this when you need diverse expert opinions — e.g., differential diagnosis, treatment options, or when symptoms could indicate multiple issues. Returns synthesized council advice.',
  parameters: {
    question: {
      type: 'string',
      description: 'The specific question or situation to present to the council. Be detailed — include symptoms, growth stage, environment, and any evidence gathered so far.',
      required: true,
    },
    team: {
      type: 'string',
      description: 'Team template to use: diagnosis (default), harvest, grow-optimization, breeding, emergency, full-council. Choose based on the type of question.',
      required: false,
    },
  },
  execute: async (args) => {
    const question = String(args.question || '');
    const teamId = String(args.team || 'diagnosis');

    if (!_providers || _providers.length === 0) {
      return JSON.stringify({
        error: 'No AI providers configured. Cannot consult the council.',
      });
    }

    if (!question.trim()) {
      return JSON.stringify({ error: 'No question provided for the council.' });
    }

    try {
      const response = await quickTeamConsult({
        templateId: teamId,
        question,
        providers: _providers,
      });

      return JSON.stringify({
        status: 'council_response',
        team: teamId,
        response,
      });
    } catch (err) {
      return JSON.stringify({
        error: `Council consultation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  },
});
