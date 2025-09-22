'use client';

import ProfileManager from '../../../../src/app/components/ProfileManager';

export default function ProfilesPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Profils voyageurs</h1>
      <ProfileManager />
    </div>
  );
}