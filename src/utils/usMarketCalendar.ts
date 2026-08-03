// -------------------------------------------------------
// 미국 증시 (NYSE/NASDAQ) 캘린더 & 서머타임(DST) 유틸리티
// -------------------------------------------------------

/**
 * 현재 또는 특정 시각을 미국 동부시(America/New_York, ET) Date 객체로 변환
 * Node.js & 브라우저 Intl API를 활용하여 DST(서머타임)를 자동 감지/반영합니다.
 */
export function getNyseTime(inputDate: Date = new Date()): Date {
  const nyString = inputDate.toLocaleString('en-US', {
    timeZone: 'America/New_York',
  });
  return new Date(nyString);
}

/**
 * 특정 연도의 부활절(Easter Sunday) 계산 (Butcher's Algorithm)
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

/**
 * N번째 특정 요일 찾기 (month: 0-indexed, dayOfWeek: 0=Sun,1=Mon...)
 */
function getNthDayOfMonth(year: number, month: number, dayOfWeek: number, n: number): Date {
  const date = new Date(year, month, 1);
  let count = 0;
  while (date.getMonth() === month) {
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === n) return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }
  return date;
}

/**
 * 그 달의 마지막 특정 요일 찾기
 */
function getLastDayOfMonth(year: number, month: number, dayOfWeek: number): Date {
  const date = new Date(year, month + 1, 0);
  while (date.getDay() !== dayOfWeek) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

/**
 * 토요일이면 금요일, 일요일이면 월요일로 관찰 휴일(Observed Holiday) 조정
 */
function adjustObservedHoliday(date: Date): Date {
  const day = date.getDay();
  const adjusted = new Date(date);
  if (day === 6) {
    adjusted.setDate(adjusted.getDate() - 1);
  } else if (day === 0) {
    adjusted.setDate(adjusted.getDate() + 1);
  }
  return adjusted;
}

/**
 * 미국 주말 여부 (토/일)
 */
export function isWeekend(date: Date = new Date()): boolean {
  const nyDate = getNyseTime(date);
  const day = nyDate.getDay();
  return day === 0 || day === 6;
}

/**
 * 미국 NYSE/NASDAQ 정기 휴장일 검증
 */
export function isUsMarketHoliday(date: Date = new Date()): boolean {
  const nyDate = getNyseTime(date);
  const year = nyDate.getFullYear();

  const toDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const currentKey = toDateKey(nyDate);

  const holidays: Date[] = [
    // 1. New Year's Day (Jan 1)
    adjustObservedHoliday(new Date(year, 0, 1)),
    // 2. Martin Luther King Jr. Day (3rd Mon in Jan)
    getNthDayOfMonth(year, 0, 1, 3),
    // 3. Washington's Birthday / Presidents' Day (3rd Mon in Feb)
    getNthDayOfMonth(year, 1, 1, 3),
    // 4. Good Friday (Friday before Easter)
    (() => {
      const easter = getEasterSunday(year);
      const gf = new Date(easter);
      gf.setDate(gf.getDate() - 2);
      return gf;
    })(),
    // 5. Memorial Day (Last Mon in May)
    getLastDayOfMonth(year, 4, 1),
    // 6. Juneteenth National Independence Day (Jun 19)
    adjustObservedHoliday(new Date(year, 5, 19)),
    // 7. Independence Day (Jul 4)
    adjustObservedHoliday(new Date(year, 6, 4)),
    // 8. Labor Day (1st Mon in Sep)
    getNthDayOfMonth(year, 8, 1, 1),
    // 9. Thanksgiving Day (4th Thu in Nov)
    getNthDayOfMonth(year, 10, 4, 4),
    // 10. Christmas Day (Dec 25)
    adjustObservedHoliday(new Date(year, 11, 25)),
  ];

  const holidayKeys = holidays.map(toDateKey);
  return holidayKeys.includes(currentKey);
}

/**
 * 뉴욕 장전 주문 시간대 (08:30 ~ 09:30 ET) 검증
 */
export function isWithinPreMarketOrderWindow(date: Date = new Date()): boolean {
  const nyDate = getNyseTime(date);
  const hours = nyDate.getHours();
  const minutes = nyDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 08:30 = 8 * 60 + 30 = 510분
  // 09:30 = 9 * 60 + 30 = 570분
  return totalMinutes >= 510 && totalMinutes <= 570;
}
