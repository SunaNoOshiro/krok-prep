import { BookOpen, CheckCircle2, Layers } from 'lucide-react';
import type { Question } from '../services/api';
import { normalizeDisplayText } from '../utils/text';

interface ScaleItem {
  label: string;
  title: string;
  description: string;
  match?: RegExp;
}

interface ScaleReference {
  eyebrow?: string;
  title: string;
  subtitle: string;
  current?: ScaleItem;
  scoreNote?: string;
  scoreBands?: ScaleItem[];
  itemsTitle?: string;
  items: ScaleItem[];
}

interface ScaleReferenceCardProps {
  question?: Question;
}

const ashworthItems: ScaleItem[] = [
  { label: '0', title: 'Немає підвищення тонусу', description: 'Пасивний рух вільний, опір не відчувається.' },
  { label: '1', title: 'Легке підвищення', description: 'Є коротке “хапання” або мінімальний опір наприкінці амплітуди.' },
  { label: '1+', title: 'Хапання + малий опір', description: 'Після “хапання” є мінімальний опір у менш ніж половині амплітуди.' },
  { label: '2', title: 'Опір у більшості руху', description: 'Тонус помітно підвищений протягом більшої частини руху, але кінцівка легко рухається.' },
  { label: '3', title: 'Пасивний рух утруднений', description: 'Тонус значно підвищений, рух виконати важко.' },
  { label: '4', title: 'Ригідність', description: 'Кінцівка майже нерухома у згинанні або розгинанні.' },
];

const asiaItems: ScaleItem[] = [
  { label: 'AIS A', title: 'Повне ушкодження', description: 'Немає моторної й чутливої функції в S4-S5, тобто немає крижового збереження.' },
  { label: 'AIS B', title: 'Сенсорне неповне', description: 'Чутливість нижче рівня, включно S4-S5, збережена; моторики нижче рівня немає.' },
  { label: 'AIS C', title: 'Моторне неповне, слабше', description: 'Моторика нижче рівня є, але більше половини ключових м’язів мають силу менше 3 балів.' },
  { label: 'AIS D', title: 'Моторне неповне, сильніше', description: 'Моторика нижче рівня є, і щонайменше половина ключових м’язів має силу 3 бали або більше.' },
  { label: 'AIS E', title: 'Норма після дефіциту', description: 'Моторна й чутлива функції нормальні, якщо раніше був неврологічний дефіцит після травми.' },
];

const mmrcItems: ScaleItem[] = [
  { label: '0', title: 'Тільки велике навантаження', description: 'Задишка лише при інтенсивній фізичній активності.' },
  { label: '1', title: 'Швидка хода або підйом', description: 'Задишка при поспіху на рівному місці або ходьбі вгору.' },
  { label: '2', title: 'Повільніше за ровесників', description: 'Йде повільніше або зупиняється при власному темпі на рівній поверхні.' },
  { label: '3', title: 'Зупинка після 100 м', description: 'Потрібна зупинка після приблизно 100 метрів або кількох хвилин ходьби.' },
  { label: '4', title: 'Задишка в побуті', description: 'Задишка не дає виходити з дому або виникає при одяганні.' },
];

const borgItems: ScaleItem[] = [
  { label: '0', title: 'Немає задишки', description: 'Пацієнт не відчуває утруднення дихання або напруження.' },
  { label: '1-2', title: 'Дуже легко', description: 'Відчуття мінімальні, навантаження добре переноситься.' },
  { label: '3-4', title: 'Помірно', description: 'Відчутне, але контрольоване навантаження.' },
  { label: '5-6', title: 'Важко', description: 'Сильне відчуття задишки або напруження, потрібен контроль інтенсивності.' },
  { label: '7-10', title: 'Дуже важко / максимум', description: 'Навантаження майже або повністю граничне.' },
];

const bergItems: ScaleItem[] = [
  { label: '0-20', title: 'Високий ризик падіння', description: 'Зазвичай потрібна значна допомога або інвалідний візок.' },
  { label: '21-40', title: 'Середній ризик', description: 'Ходьба можлива, але часто потрібна підтримка або допоміжний засіб.' },
  { label: '41-56', title: 'Нижчий ризик', description: 'Краща рівновага, більше шансів на самостійне пересування.' },
];

const fimItems: ScaleItem[] = [
  { label: '1', title: 'Повна допомога', description: 'Пацієнт виконує менше 25% завдання.' },
  { label: '2-3', title: 'Велика / помірна допомога', description: 'Потрібна фізична допомога, але частину дії пацієнт виконує сам.' },
  { label: '4-5', title: 'Мінімальна допомога / нагляд', description: 'Потрібен контакт, підказки або контроль без значної фізичної допомоги.' },
  { label: '6-7', title: 'Незалежність', description: '6 - з пристроєм або повільніше; 7 - повністю самостійно.' },
];

const gmfcsItems: ScaleItem[] = [
  { label: 'I', title: 'Ходить без обмежень', description: 'Самостійна хода; складніші рухи, біг і стрибки можуть бути повільнішими або менш координованими.' },
  { label: 'II', title: 'Ходить з обмеженнями', description: 'Може ходити самостійно, але має труднощі з довгими дистанціями, нерівною поверхнею, сходами або швидкістю.' },
  { label: 'III', title: 'Ходить із ручним засобом', description: 'Потрібні ходунки, милиці чи інший ручний засіб; на довгі дистанції може знадобитися колісне крісло.' },
  { label: 'IV', title: 'Самомобільність обмежена', description: 'Часто потрібна допомога або powered mobility; самостійне пересування можливе в обмежених умовах.' },
  { label: 'V', title: 'Транспортують у кріслі колісному', description: 'Значні обмеження контролю голови й тулуба; самостійне пересування дуже обмежене.' },
];

const ranchoItems: ScaleItem[] = [
  { label: 'I', title: 'Немає відповіді', description: 'Не реагує на зовнішні стимули; потрібна повна допомога.' },
  { label: 'II', title: 'Генералізована відповідь', description: 'Реакції непослідовні й неспецифічні, часто однакові на різні стимули.' },
  { label: 'III', title: 'Локалізована відповідь', description: 'Реагує на конкретний стимул, але ще непослідовно; краще реагує на знайомих людей.' },
  { label: 'IV', title: 'Сплутаний, збуджений', description: 'Надмірна активність, коротка увага, поведінка часто недоцільна; потрібна максимальна допомога.' },
  { label: 'V', title: 'Сплутаний, недоречний', description: 'Може виконати просту дію після показу, але відповіді на складні команди випадкові; виражені проблеми пам’яті.' },
  { label: 'VI', title: 'Сплутаний, доречний', description: 'Стабільно виконує прості команди й знайомі дії, але нове навчання і безпека ще обмежені.' },
  { label: 'VII', title: 'Автоматичний, доречний', description: 'Орієнтується у знайомій рутині, однак має поверхневе усвідомлення проблем і потребує нагляду.' },
  { label: 'VIII', title: 'Цілеспрямований, доречний', description: 'Діє доречно, але у стресі або складних ситуаціях може потребувати підстрахування.' },
  { label: 'IX', title: 'Цілеспрямований, допомога за потреби', description: 'Здебільшого самостійний, але може просити допомогу у незвичних або складних ситуаціях.' },
  { label: 'X', title: 'Модифікована незалежність', description: 'Планує і виконує складні дії самостійно, може потребувати більше часу або власних стратегій.' },
];

const hoehnYahrItems: ScaleItem[] = [
  { label: 'I', title: 'Однобічні прояви', description: 'Симптоми лише з одного боку тіла, функціональна незалежність переважно збережена.' },
  { label: 'II', title: 'Двобічні прояви без порушення рівноваги', description: 'Симптоми з обох боків, але постуральна нестійкість ще не є провідною.' },
  { label: 'III', title: 'Постуральна нестійкість', description: 'Є порушення рівноваги, але пацієнт ще фізично незалежний.' },
  { label: 'IV', title: 'Тяжке обмеження, але може стояти/ходити', description: 'Виражена інвалідизація; самостійне стояння або пересування ще можливе.' },
  { label: 'V', title: 'Крісло колісне або ліжко', description: 'Без допомоги пацієнт прикутий до ліжка або крісла колісного.' },
];

const barthelItems: ScaleItem[] = [
  { label: 'Їжа', title: 'Приймання їжі', description: 'Самостійність у харчуванні; допомога може бути потрібна для нарізання або підготовки їжі.' },
  { label: 'Купання', title: 'Купання / душ', description: 'Чи може людина помитися самостійно.' },
  { label: 'Догляд', title: 'Гігієна', description: 'Обличчя, волосся, зуби, гоління або подібний щоденний догляд.' },
  { label: 'Одягання', title: 'Одягання', description: 'Одяг, ґудзики, блискавки, шнурки; може оцінюватися часткова допомога.' },
  { label: 'Кишківник', title: 'Контроль дефекації', description: 'Континенція або епізодичні/часті випадки нетримання.' },
  { label: 'Сечовий', title: 'Контроль сечовипускання', description: 'Континенція або здатність самостійно керувати катетером.' },
  { label: 'Туалет', title: 'Користування туалетом', description: 'Пересідання на туалет, одяг, гігієна після туалету.' },
  { label: 'Трансфер', title: 'Ліжко-крісло', description: 'Переміщення з ліжка у крісло і назад.' },
  { label: 'Ходьба', title: 'Пересування рівною поверхнею', description: 'Ходьба або самостійне пересування кріслом колісним на рівній поверхні.' },
  { label: 'Сходи', title: 'Підйом і спуск сходами', description: 'Здатність користуватися сходами самостійно або з допомогою.' },
];

const barthelScoreBands: ScaleItem[] = [
  { label: '0-20', title: 'Повна залежність', description: 'Тяжкий стан, потрібна значна допомога майже в усіх базових діях.' },
  { label: '21-60', title: 'Виражена залежність', description: 'Пацієнт частину дій виконує, але потребує регулярної допомоги.' },
  { label: '61-90', title: 'Помірна залежність', description: 'Більшість дій можливі, однак потрібна допомога або нагляд в окремих пунктах.' },
  { label: '91-99', title: 'Легка залежність', description: 'Майже самостійний, але є невеликі обмеження або потреба в підстрахуванні.' },
  { label: '100', title: 'Повна незалежність', description: 'Базові активності щоденного життя виконуються самостійно.' },
];

const neonatalPainScaleItems: ScaleItem[] = [
  { label: 'NIPS', title: 'Процедурний біль новонароджених', description: 'Поведінкова шкала для недоношених і доношених немовлят: обличчя, плач, дихання, руки, ноги, стан збудження.' },
  { label: 'N-PASS', title: 'Біль, збудження і седація', description: 'Оцінює не лише біль, а й ажитацію/седацію; часто корисна в інтенсивній терапії новонароджених.' },
  { label: 'NBAS', title: 'Поведінкова оцінка немовляти', description: 'Шкала Бразелтона описує нейроповедінкові реакції й адаптацію, а не процедурний біль.' },
  { label: 'ВАШ', title: 'Суб’єктивний біль', description: 'Візуальна аналогова шкала потребує самозвіту, тому не підходить немовляті, яке не може описати біль.' },
];

const spinalInstrumentItems: ScaleItem[] = [
  { label: 'ASIA', title: 'Неврологічний рівень і тяжкість SCI', description: 'Стандарт для моторики, чутливості, крижового збереження та повноти ушкодження спинного мозку.' },
  { label: 'SCIM', title: 'Незалежність саме при SCI', description: 'Оцінює самообслуговування, дихання/сфінктери й мобільність у людей з ураженням спинного мозку.' },
  { label: 'FIM', title: 'Загальна функціональна незалежність', description: 'Показує рівень допомоги у самообслуговуванні, пересуванні, комунікації та когнітивних діях.' },
  { label: 'COVS', title: 'Функціональна мобільність', description: 'Clinical Outcome Variables Scale описує практичні рухові навички та мобільність у реабілітації.' },
  { label: 'VFM', title: 'Функціональні рухові можливості', description: 'Орієнтована на виконання рухових завдань, але не визначає неврологічний рівень SCI.' },
];

const cerebralPalsyScaleItems: ScaleItem[] = [
  { label: 'GMFCS', title: 'Великі моторні функції', description: 'Рівні I-V описують сидіння, ходу, сходи й потребу в допоміжних засобах при ДЦП.' },
  { label: 'FMS', title: 'Функціональна мобільність', description: 'Описує, як дитина пересувається на 5, 50 і 500 метрів у реальному середовищі.' },
  { label: 'CFCS', title: 'Комунікація', description: 'Класифікує ефективність повсякденного спілкування, а не ходу.' },
  { label: 'MACS', title: 'Ручна функція', description: 'Описує, як дитина використовує руки для роботи з предметами в повсякденні.' },
];

const dyspneaChoiceItems: ScaleItem[] = [
  { label: 'Борг', title: 'Суб’єктивна задишка/напруження', description: 'Пацієнт оцінює, наскільки важко дихати або виконувати навантаження.' },
  { label: 'NYHA', title: 'Функціональний клас серцевої недостатності', description: 'Класи I-IV описують, при якому рівні активності з’являються симптоми.' },
  { label: '6MWT', title: 'Витривалість ходьби', description: 'Вимірює дистанцію за 6 хвилин, а не суб’єктивну задишку як шкала Борга.' },
  { label: '2MWT', title: 'Коротший тест витривалості', description: 'Вимірює дистанцію за 2 хвилини, коли 6 хвилин забагато.' },
  { label: 'BBS', title: 'Рівновага', description: 'Шкала Берга оцінює баланс і ризик падіння, а не рівень задишки.' },
];

const functionalChoiceItems: ScaleItem[] = [
  { label: 'FIM', title: 'Функціональна незалежність', description: 'Оцінює, скільки допомоги потрібно для самообслуговування, пересування, комунікації та когнітивних дій.' },
  { label: 'Ренкін', title: 'Глобальна інвалідизація', description: 'Модифікована шкала Ренкіна часто використовується після інсульту для загального рівня залежності.' },
  { label: 'Освестрі', title: 'Біль у попереку', description: 'Оцінює інвалідизацію, пов’язану з болем у нижній частині спини.' },
  { label: 'VAS', title: 'Інтенсивність болю', description: 'Візуальна аналогова шкала показує суб’єктивну силу болю, а не самостійність.' },
  { label: 'Хокінс', title: 'Тест плеча', description: 'Провокаційний тест для субакроміального імпінджменту; це не шкала функціональної незалежності.' },
];

const kneeTestItems: ScaleItem[] = [
  {
    label: 'Лахман',
    title: 'ПХЗ, коліно 20-30°',
    description: 'Стабілізують стегно і зміщують гомілку вперед. Надмірний передній зсув найкраще вказує на ушкодження ПХЗ.',
    match: /Лахман/i,
  },
  {
    label: 'Передня шухлядка',
    title: 'ПХЗ, коліно близько 90°',
    description: 'Також перевіряє передній зсув гомілки, але коліно зігнуте більше, ніж у тесті Лахмана.',
    match: /передн[а-яіїєґ\s]+(?:висувн[а-яіїєґ\s]+)?шухляд/i,
  },
  {
    label: 'МакМюррей',
    title: 'Меніски',
    description: 'Провокують біль або клацання ротацією і рухом у коліні. Це тест меніска, не ПХЗ.',
    match: /МакМюрре/i,
  },
  {
    label: 'Патрік / FABER',
    title: 'Кульшовий або крижово-клубовий суглоб',
    description: 'Положення FABER перевіряє біль у кульшовому або крижово-клубовому суглобі, а не передній зсув гомілки.',
    match: /Патр[іi]к|FABER/i,
  },
  {
    label: 'Х’юстон',
    title: 'Ротаційна нестабільність коліна',
    description: 'Орієнтир для інших типів нестабільності коліна; у задачі “30° + передній зсув” ключем є Лахман.',
    match: /Х[’']?юстон/i,
  },
];

const postStrokeMotorTestItems: ScaleItem[] = [
  {
    label: 'МКВ',
    title: 'Моторний контроль вертикалізації',
    description: 'Функціонально оцінює, як нога і тулуб працюють під час вставання або вертикалізації.',
    match: /моторн[а-яіїєґ\s]+контрол[а-яіїєґ\s]+вертикал/i,
  },
  {
    label: 'ММТ',
    title: 'Ізольована сила м’язів',
    description: 'Мануальний м’язовий тест корисний для сили, але при спастичності й синергіях може бути менш точним для реальної функції.',
    match: /мануальн[а-яіїєґ-]*\s+м[’']язов|ММТ/i,
  },
  {
    label: '6MWT',
    title: 'Витривалість ходьби',
    description: 'Вимірює дистанцію за 6 хвилин; це більше про толерантність до навантаження, ніж силу ноги.',
    match: /6(?:[-\s]?и)?[-\s]?хвилин|6MWT/i,
  },
  {
    label: 'TUG',
    title: 'Функціональна мобільність',
    description: 'Швидко перевіряє вставання, ходу, розворот і сідання; не ізолює силу нижньої кінцівки.',
    match: /\bTUG\b|Time(?:d)?\s+Up\s+and\s+Go|Встань та йди/i,
  },
  {
    label: '4 квадрати',
    title: 'Динамічна рівновага',
    description: 'Оцінює кроки в різних напрямках і зміну опори, а не основний моторний контроль вертикалізації.',
    match: /4[-\s]?(?:ох|х)?\s+квадратн[а-яіїєґ\s]+крок|four square/i,
  },
];

const spineMobilityTestItems: ScaleItem[] = [
  {
    label: 'Шобер',
    title: 'Поперековий відділ',
    description: 'Вимірює рухливість попереку під час нахилу вперед.',
    match: /Шобер/i,
  },
  {
    label: 'Отт',
    title: 'Грудний відділ',
    description: 'Оцінює рухливість грудного відділу хребта.',
    match: /тест Отта|Отта/i,
  },
  {
    label: 'Форестьє',
    title: 'Постава біля стіни',
    description: 'Орієнтовно показує порушення постави й рухливості хребта.',
    match: /Форесть[єе]/i,
  },
  {
    label: 'Підборіддя-груднина',
    title: 'Шийне згинання',
    description: 'Перевіряє, чи може підборіддя наблизитися до грудини.',
    match: /підборідд[яа][-\s]грудин/i,
  },
];

const walkingTestItems: ScaleItem[] = [
  {
    label: '10MWT',
    title: 'Швидкість ходьби',
    description: '10-метровий тест вимірює швидкість на короткій дистанції.',
    match: /10[-\s]?метров|10MWT/i,
  },
  {
    label: '6MWT',
    title: 'Витривалість',
    description: '6-хвилинний тест показує, яку дистанцію пацієнт проходить за 6 хвилин.',
    match: /6(?:[-\s]?и)?[-\s]?хвилин|6MWT/i,
  },
  {
    label: '2MWT',
    title: 'Коротша витривалість',
    description: '2-хвилинний тест використовують, коли 6 хвилин забагато.',
    match: /2(?:[-\s]?х)?[-\s]?хвилин|2MWT/i,
  },
  {
    label: 'TUG',
    title: 'Мобільність і ризик падінь',
    description: 'Встати, пройти, розвернутися, повернутися і сісти. Це не чиста швидкість ходьби.',
    match: /\bTUG\b|Time(?:d)?\s+Up\s+and\s+Go|Встань та йди/i,
  },
  {
    label: 'Ласег',
    title: 'Натяг корінців / сідничного нерва',
    description: 'Піднімання прямої ноги провокує корінцевий біль; це не тест швидкості ходьби.',
    match: /Ласег/i,
  },
];

function normalizeScaleLetter(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Е/g, 'E');
}

function findItem(items: ScaleItem[], label: string) {
  return items.find((item) => item.label.toLowerCase() === label.toLowerCase());
}

function getNamedCurrent(items: ScaleItem[], answer: string): ScaleItem | undefined {
  const normalizedAnswer = normalizeDisplayText(answer).toLowerCase();

  return items.find((item) => {
    if (item.match?.test(answer)) return true;

    const labelParts = item.label
      .split('/')
      .map((part) => normalizeDisplayText(part).trim().toLowerCase())
      .filter(Boolean);

    return labelParts.some((label) => normalizedAnswer.includes(label)) ||
      normalizedAnswer.includes(normalizeDisplayText(item.title).toLowerCase());
  });
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function getAshworthCurrent(answer: string, text: string) {
  const source = `${answer} ${text}`;
  if (/\b1\+/.test(source) || /менш[а-яіїєґ\s]+половин/i.test(source)) return findItem(ashworthItems, '1+');
  if (/^0$/.test(answer.trim())) return findItem(ashworthItems, '0');
  if (/^1$/.test(answer.trim())) return findItem(ashworthItems, '1');
  if (/^2$/.test(answer.trim()) || /більш[а-яіїєґ\s]+частин/i.test(source)) return findItem(ashworthItems, '2');
  if (/^3$/.test(answer.trim()) || /пасивн[а-яіїєґ\s]+утруднен/i.test(source)) return findItem(ashworthItems, '3');
  if (/^4$/.test(answer.trim()) || /ригід/i.test(source)) return findItem(ashworthItems, '4');
  return undefined;
}

function getAsiaCurrent(answer: string, text: string): ScaleItem | undefined {
  const grade = normalizeScaleLetter(answer);
  if (/^[ABCDE]$/.test(grade)) return findItem(asiaItems, `AIS ${grade}`);

  if (/ASIA\s*A\s*[-–]\s*[BВ]/i.test(text)) {
    return {
      label: 'AIS A-B',
      title: 'Важчий моторний прогноз',
      description: 'A означає повне ушкодження, B - сенсорне неповне. У задачах про прогноз ходьби важливо дивитися ще й на неврологічний рівень.',
    };
  }

  return undefined;
}

function getNumericCurrent(items: ScaleItem[], answer: string) {
  const value = answer.trim();
  const numeric = Number(value.match(/\d+/)?.[0]);

  return items.find((item) => {
    if (item.label === value || item.label.split('-').some((part) => part === value)) return true;

    const range = item.label.match(/^(\d+)-(\d+)$/);
    if (!Number.isNaN(numeric) && range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      return numeric >= start && numeric <= end;
    }

    return false;
  });
}

function getBarthelCurrent(answer: string): ScaleItem | undefined {
  if (/біг/i.test(answer)) {
    return {
      label: 'Зайве',
      title: 'Біг по рівній поверхні',
      description: 'Індекс Бартел оцінює базові побутові дії та просте пересування. Біг - це вища рухова активність, тому він не є пунктом Barthel.',
    };
  }

  return undefined;
}

function getGmfcsCurrent(answer: string, text: string): ScaleItem | undefined {
  const source = `${answer} ${text}`;
  const roman = answer.trim().match(/\b(?:GMFCS\s*)?([IVX]{1,3})\b/i)?.[1]?.toUpperCase();

  if (roman) return findItem(gmfcsItems, roman);
  if (/ручн[а-яіїєґ\s]+зас[іi]б|ходунк|милиц/i.test(source)) return findItem(gmfcsItems, 'III');
  if (/без обмежен/i.test(source)) return findItem(gmfcsItems, 'I');
  if (/з обмежен/i.test(source)) return findItem(gmfcsItems, 'II');
  if (/powered mobility|самомобільн[а-яіїєґ\s]+обмеж/i.test(source)) return findItem(gmfcsItems, 'IV');
  if (/транспорту/i.test(source) && /кр[іi]сл/i.test(source)) return findItem(gmfcsItems, 'V');

  return undefined;
}

const ranchoLevelWords: Record<string, string> = {
  перший: 'I',
  першого: 'I',
  другий: 'II',
  другого: 'II',
  третій: 'III',
  третього: 'III',
  четвертий: 'IV',
  четвертого: 'IV',
  пятий: 'V',
  "п'ятий": 'V',
  пятого: 'V',
  "п'ятого": 'V',
  шостий: 'VI',
  шостого: 'VI',
  сьомий: 'VII',
  сьомого: 'VII',
  восьмий: 'VIII',
  восьмого: 'VIII',
  девятий: 'IX',
  "дев'ятий": 'IX',
  девятого: 'IX',
  "дев'ятого": 'IX',
  десятий: 'X',
  десятого: 'X',
};

const ranchoNumbers: Record<string, string> = {
  '1': 'I',
  '2': 'II',
  '3': 'III',
  '4': 'IV',
  '5': 'V',
  '6': 'VI',
  '7': 'VII',
  '8': 'VIII',
  '9': 'IX',
  '10': 'X',
};

function getRanchoCurrent(text: string): ScaleItem | undefined {
  const levelMatch = text.match(/(?:рів(?:ень|ня)|level)\s*(10|[1-9]|[IVX]{1,4})|(?:\b(10|[1-9]|[IVX]{1,4})\s*(?:рів(?:ень|ня)|level))/i);
  const level = (levelMatch?.[1] ?? levelMatch?.[2])?.toUpperCase();
  if (level) return findItem(ranchoItems, ranchoNumbers[level] ?? level);

  const word = Object.keys(ranchoLevelWords).find((key) => new RegExp(`\\b${key}\\b`, 'i').test(text));
  if (word) return findItem(ranchoItems, ranchoLevelWords[word]);

  return undefined;
}

function getHoehnYahrCurrent(text: string): ScaleItem | undefined {
  const stageMatch = text.match(/(?:стад[іi][яї]|stage)\s*(I{1,3}|IV|V|[1-5])|(?:\b(I{1,3}|IV|V|[1-5])\s*(?:стад[іi][яї]|stage))/i);
  const stage = (stageMatch?.[1] ?? stageMatch?.[2])?.toUpperCase();

  if (!stage) return undefined;

  const numericToRoman: Record<string, string> = {
    '1': 'I',
    '2': 'II',
    '3': 'III',
    '4': 'IV',
    '5': 'V',
  };

  return findItem(hoehnYahrItems, numericToRoman[stage] ?? stage);
}

function getScaleReference(question?: Question): ScaleReference | null {
  if (!question) return null;

  const answer = normalizeDisplayText(question.options[question.correctAnswer] ?? '');
  const text = normalizeDisplayText([
    question.question,
    question.hint ?? '',
    question.explanation,
    ...question.options,
  ].join(' '));

  if (/Лахман|передн[а-яіїєґ\s]+(?:висувн[а-яіїєґ\s]+)?шухляд|МакМюрре|Патр[іi]к|Х[’']?юстон/i.test(text)) {
    return {
      eyebrow: 'Тестова шпаргалка',
      title: 'Ортопедичні тести коліна',
      subtitle: 'Якщо в умові “коліно 20-30° + передній зсув гомілки” - це Лахман. Інші варіанти перевіряють інші структури або інше положення.',
      current: getNamedCurrent(kneeTestItems, answer),
      itemsTitle: 'Не плутати варіанти',
      items: kneeTestItems,
    };
  }

  if (/моторн[а-яіїєґ\s]+контрол[а-яіїєґ\s]+вертикал|мануальн[а-яіїєґ-]*\s+м[’']язов|4[-\s]?(?:ох|х)?\s+квадратн[а-яіїєґ\s]+крок|Time(?:d)?\s+Up\s+and\s+Go|Встань та йди/i.test(text)) {
    return {
      eyebrow: 'Тестова шпаргалка',
      title: 'Тести сили, ходи й балансу',
      subtitle: 'При спастичності й синергіях функціональний тест у вертикалізації краще показує реальну роботу ноги, ніж ізольований ММТ.',
      current: getNamedCurrent(postStrokeMotorTestItems, answer),
      itemsTitle: 'Що саме оцінює',
      items: postStrokeMotorTestItems,
    };
  }

  if (/Шобер|тест Отта|Отта|Форесть[єе]|підборідд[яа][-\s]грудин/i.test(text)) {
    return {
      eyebrow: 'Тестова шпаргалка',
      title: 'Тести рухливості хребта',
      subtitle: 'У таких завданнях ключ - який відділ хребта перевіряє тест: шия, грудний чи поперековий.',
      current: getNamedCurrent(spineMobilityTestItems, answer),
      itemsTitle: 'Орієнтири',
      items: spineMobilityTestItems,
    };
  }

  if (/швидк[а-яіїєґ\s]+ходьб|10[-\s]?метров|10MWT/i.test(text) && countMatches(text, [/10[-\s]?метров|10MWT/i, /6(?:[-\s]?и)?[-\s]?хвилин|6MWT/i, /2(?:[-\s]?х)?[-\s]?хвилин|2MWT/i, /\bTUG\b|Time(?:d)?\s+Up\s+and\s+Go|Встань та йди/i, /Ласег/i]) >= 2) {
    return {
      eyebrow: 'Тестова шпаргалка',
      title: 'Тести ходьби',
      subtitle: '10MWT відповідає за швидкість, 6MWT/2MWT - за витривалість, TUG - за мобільність і ризик падінь.',
      current: getNamedCurrent(walkingTestItems, answer),
      itemsTitle: 'Що міряє кожен тест',
      items: walkingTestItems,
    };
  }

  if (/NIPS|N[-\s]?PASS|NBAS|ВАШ|\bVAS\b/i.test(text) && /немовля|новонарод|недоношен|процедурн[а-яіїєґ\s]+бол/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкали болю немовлят',
      subtitle: 'Коротко: NIPS - процедурний біль новонароджених; N-PASS ширше про біль/збудження/седацію; NBAS - поведінка; ВАШ потребує самозвіту.',
      current: getNamedCurrent(neonatalPainScaleItems, answer),
      itemsTitle: 'Що означають варіанти',
      items: neonatalPainScaleItems,
    };
  }

  if (countMatches(text, [/\bASIA\b|\bAIS\b|\bISNCSCI\b/i, /\bSCIM\b/i, /\bVFM\b/i, /\bCOVS\b/i, /\bFIM\b/i]) >= 2) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкали при SCI та функції',
      subtitle: 'Коли питають тяжкість і рівень ушкодження спинного мозку - шукай ASIA/ISNCSCI; інші шкали більше про функцію або мобільність.',
      current: getNamedCurrent(spinalInstrumentItems, answer),
      itemsTitle: 'Що оцінює кожна',
      items: spinalInstrumentItems,
    };
  }

  if (countMatches(text, [/\bGMFCS\b/i, /\bFMS\b/i, /\bCFCS\b/i, /\bMACS\b/i]) >= 2) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Класифікації при ДЦП',
      subtitle: 'Ці інструменти схожі за форматом, але оцінюють різні домени: ходу, мобільність, комунікацію або руки.',
      current: getNamedCurrent(cerebralPalsyScaleItems, answer),
      itemsTitle: 'Не плутати',
      items: cerebralPalsyScaleItems,
    };
  }

  if (/Борг|BORG/i.test(text) && countMatches(text, [/NYHA/i, /Берга|Berg|BBS/i, /6(?:[-\s]?и)?[-\s]?хвилин|6MWT/i, /2(?:[-\s]?х)?[-\s]?хвилин|2MWT/i]) >= 1) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Задишка, витривалість чи баланс',
      subtitle: 'У цих варіантах легко переплутати суб’єктивну шкалу задишки з тестами ходьби або шкалою рівноваги.',
      current: getNamedCurrent(dyspneaChoiceItems, answer),
      itemsTitle: 'Що саме оцінює',
      items: dyspneaChoiceItems,
    };
  }

  if (/\bFIM\b|функціональн[а-яіїєґ\s]+незалеж/i.test(text) && countMatches(text, [/Ренк[іi]н/i, /Освестр/i, /\bVAS\b|ВАШ/i, /Хок[іi]нс/i]) >= 1) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Незалежність, біль чи окремий тест',
      subtitle: 'Якщо питають можливість самостійної діяльності та цілі реабілітації - FIM підходить краще за шкали болю або локальні ортопедичні тести.',
      current: getNamedCurrent(functionalChoiceItems, answer),
      itemsTitle: 'Чим відрізняються варіанти',
      items: functionalChoiceItems,
    };
  }

  if (/Ашфорт|Ashworth/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкала Ашфорта',
      subtitle: 'Оцінює спастичність за опором під час пасивного руху.',
      current: getAshworthCurrent(answer, text),
      items: ashworthItems,
    };
  }

  if (/ASIA|AIS|ISNCSCI/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'ASIA / AIS',
      subtitle: 'Класифікує тяжкість ушкодження спинного мозку за моторикою, чутливістю і крижовим збереженням.',
      current: getAsiaCurrent(answer, text),
      items: asiaItems,
    };
  }

  if (/mMRC|Medical Research Council|медичн[а-яіїєґ\s]+дослідницьк/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'mMRC',
      subtitle: 'Коротко оцінює задишку за тим, наскільки вона обмежує ходьбу і побут.',
      current: getNumericCurrent(mmrcItems, answer),
      items: mmrcItems,
    };
  }

  if (/Борг|BORG/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкала Борга',
      subtitle: 'Суб’єктивна оцінка задишки або напруження під час навантаження.',
      current: getNumericCurrent(borgItems, answer),
      items: borgItems,
    };
  }

  if (/Берга|Berg|BBS/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкала рівноваги Берга',
      subtitle: 'Оцінює рівновагу і ризик падіння; максимум - 56 балів.',
      current: getNumericCurrent(bergItems, answer),
      items: bergItems,
    };
  }

  if (/Хен[ао]м?\s*(?:та|і)\s*Яр|Hoehn|Yahr/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Шкала Хена і Яра',
      subtitle: 'Описує стадію хвороби Паркінсона за поширеністю симптомів, рівновагою і самостійністю.',
      current: getHoehnYahrCurrent(text),
      itemsTitle: 'Стадії коротко',
      items: hoehnYahrItems,
    };
  }

  if (/Rancho|Ранчо|Los Amigos|Лос Амігос/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Rancho Los Amigos',
      subtitle: 'Описує когнітивно-поведінкове відновлення після ЧМТ. Рівні йдуть від I без відповіді до X модифікованої незалежності.',
      current: getRanchoCurrent(text),
      itemsTitle: 'Рівні Rancho коротко',
      items: ranchoItems,
    };
  }

  if (/Бартел|Barthel/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'Індекс Бартел',
      subtitle: 'Оцінює базові активності щоденного життя та потребу в допомозі; максимум - 100 балів.',
      scoreNote: 'Оцінюють фактичні дії пацієнта за останні 24-48 годин, а не те, що він теоретично міг би зробити.',
      scoreBands: barthelScoreBands,
      itemsTitle: 'Пункти шкали',
      current: getBarthelCurrent(answer),
      items: barthelItems,
    };
  }

  if (/GMFCS|Gross Motor Function|великих моторних функц|церебральн[а-яіїєґ\s]+параліч/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'GMFCS',
      subtitle: 'Класифікує великі моторні функції дітей із церебральним паралічем. Це рівні I-V, а не бальна сума.',
      current: getGmfcsCurrent(answer, text),
      itemsTitle: 'Рівні GMFCS коротко',
      items: gmfcsItems,
    };
  }

  if (/\bFIM\b|функціональн[а-яіїєґ\s]+незалеж/i.test(text)) {
    return {
      eyebrow: 'Шкальна шпаргалка',
      title: 'FIM',
      subtitle: 'Оцінює функціональну незалежність у самообслуговуванні, пересуванні, комунікації та когнітивних діях.',
      items: fimItems,
    };
  }

  return null;
}

export function ScaleReferenceCard({ question }: ScaleReferenceCardProps) {
  const reference = getScaleReference(question);

  if (!reference) return null;

  return (
    <section className="scale-reference-card rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start gap-2.5">
        <div className="rounded-xl bg-indigo-100 p-1.5 text-indigo-600">
          <Layers className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600">{reference.eyebrow ?? 'Шпаргалка'}</p>
          <h4 className="mt-0.5 text-lg font-black leading-tight text-slate-900">{reference.title}</h4>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">{reference.subtitle}</p>
        </div>
      </div>

      {reference.current && (
        <div className="scale-reference-current mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> У цьому питанні
          </div>
          <p className="mt-1.5 text-base font-black leading-snug text-emerald-950">
            {reference.current.label}: {reference.current.title}
          </p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-900">
            {reference.current.description}
          </p>
        </div>
      )}

      {reference.scoreBands && (
        <div className="scale-reference-score mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
            <BookOpen className="h-3.5 w-3.5" /> Оцінка суми балів
          </div>
          {reference.scoreNote && (
            <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-slate-600">{reference.scoreNote}</p>
          )}
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {reference.scoreBands.map((item) => (
              <div key={item.label} className="rounded-lg border border-white bg-white px-2.5 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
                <p className="text-xs font-black leading-tight text-slate-900">
                  <span className="text-indigo-700">{item.label}</span> - {item.title}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold leading-snug text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
          <BookOpen className="h-3.5 w-3.5" /> {reference.itemsTitle ?? 'Інші рівні коротко'}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {reference.items.map((item) => {
            const isCurrent = reference.current?.label === item.label;
            return (
              <div
                key={item.label}
                className={`scale-reference-item rounded-xl border p-2.5 ${isCurrent ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`rounded-lg px-1.5 py-0.5 text-[11px] font-black ${isCurrent ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700'}`}>
                    {item.label}
                  </span>
                  <div>
                    <p className="text-xs font-black leading-snug text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-600">{item.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
