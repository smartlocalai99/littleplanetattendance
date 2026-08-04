export default function HomeRedirect() {
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
