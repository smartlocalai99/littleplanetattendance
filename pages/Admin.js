export default function AdminLegacyRedirect() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: "/admin/dashboard",
      permanent: false,
    },
  };
}
