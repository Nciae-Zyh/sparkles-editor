export default eventHandler(async () => {
  const templates = [
    {
      id: 'meeting-notes',
      title: 'Meeting Notes',
      category: 'work',
      content: '# Meeting Notes\n\n## Attendees\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] '
    },
    {
      id: 'weekly-report',
      title: 'Weekly Report',
      category: 'work',
      content: '# Weekly Report\n\n## Highlights\n- \n\n## Completed\n- \n\n## Risks\n- \n\n## Next Week\n- '
    },
    {
      id: 'project-plan',
      title: 'Project Plan',
      category: 'product',
      content: '# Project Plan\n\n## Objective\n\n## Scope\n\n## Timeline\n\n## Milestones\n- '
    },
    {
      id: 'daily-journal',
      title: 'Daily Journal',
      category: 'personal',
      content: '# Daily Journal\n\n## Today I Did\n\n## Reflections\n\n## Tomorrow Focus\n'
    }
  ]

  return { templates }
})
