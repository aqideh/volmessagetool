export default function GeneralLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <nav className="general-subnav" aria-label="General messaging navigation">
        <a href="/general">Messages</a>
        <a href="/general/backup">Backup</a>
      </nav>
      {children}
    </>
  );
}
