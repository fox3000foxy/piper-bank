import { guideCopy } from '../i18n/guides';
import { t, type Locale } from '../i18n/ui';

export interface DocLink { title: string; path: string; icon: string; summary: string }
export interface DocGroup { label: string; items: DocLink[] }

/** Documentation tree, shared by the docs sidebar, the home page and the search palette. */
export function docsNav(locale: Locale): DocGroup[] {
  const { str } = guideCopy(locale);
  return [
    {
      label: t(locale, 'docs.groupStart'),
      items: [
        { title: t(locale, 'docs.overview'), path: '/guides/#overview', icon: 'book', summary: t(locale, 'docs.overviewSummary') },
      ],
    },
    {
      label: t(locale, 'docs.groupCreate'),
      items: [
        { title: str('datasetTitle'), path: '/guides/#dataset-guide', icon: 'database', summary: str('datasetIntro') },
        { title: str('trainingTitle'), path: '/guides/#training-guide', icon: 'gauge', summary: str('trainingIntro') },
      ],
    },
    {
      label: t(locale, 'docs.groupUse'),
      items: [
        { title: str('useVoiceTitle'), path: '/guides/#use-voice-guide', icon: 'terminal', summary: str('useVoiceIntro') },
        { title: str('npmTitle') || 'Node.js', path: '/guides/#pipertts-guide', icon: 'code', summary: str('npmIntro') },
        { title: str('ppTitle'), path: '/guides-piper-plus/', icon: 'layers', summary: str('ppIntro') },
      ],
    },
  ];
}
