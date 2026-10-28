export const I = {
  home: 'M4 4.5h6.5V11H4zM13.5 4.5H20V8h-6.5zM13.5 11H20v8.5h-6.5zM4 14h6.5v5.5H4z',
  cal: 'M4 6.5h16v13H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
  list: 'M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  chart: 'M4 19.5h16M7 16v-5M12 16V6.5M17 16v-8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  doc: 'M6.5 3.5h8l3.5 3.5v13.5h-11.5zM14 3.5V7.5h4M9.5 12h5M9.5 15.5h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  refresh: 'M20 11.5A8 8 0 1 0 17.7 17M20 5v6.5h-6.5',
  chev: 'M7 10l5 5 5-5',
  collapse: 'M15 6l-6 6 6 6',
  wallet: 'M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5zM4 7.5l11-3.5V7.5M16 13.5h.01',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 7.5V12l3 2',
}
export const Icon = ({ d, className = 'w-[22px] h-[22px]', sw = 1.7 }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
