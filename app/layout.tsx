import './globals.css';

export const metadata = {
  title: 'MHUB Workflow Admin',
  description: 'Manage approval workflows, templates, and approval actions.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
