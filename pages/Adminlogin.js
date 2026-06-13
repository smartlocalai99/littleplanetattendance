export default function AdminLoginLegacyRedirect() {
  return null;
}

export function getServerSideProps() {
  return {
    redirect: {
      destination: "/admin/login",
      permanent: false,
    },
  };
}
